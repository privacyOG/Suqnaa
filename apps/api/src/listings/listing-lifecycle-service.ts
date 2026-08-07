import { sql } from 'kysely';
import { db } from '../db/index.js';
import {
  listingExpiryFrom,
  resolveListingLifecycleConfiguration
} from '../config/listing-lifecycle-config.js';
import { canPublishInventory } from './inventory-policy.js';
import { releaseInventoryReservation } from './inventory-reservation-service.js';

export class ListingLifecycleError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

function renewalAvailableAt(expiresAt: Date | string | null, renewalWindowDays: number): Date | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  return new Date(expiry.getTime() - renewalWindowDays * 24 * 60 * 60 * 1000);
}

function serializeLifecycleListing(row: Record<string, any>) {
  return {
    id: String(row.id),
    title: row.title === undefined ? undefined : String(row.title),
    status: String(row.status),
    availabilityStatus: String(row.availability_status),
    availableQuantity: row.available_quantity === null ? null : Number(row.available_quantity),
    expiresAt: row.expires_at ?? null,
    lastRenewedAt: row.last_renewed_at ?? null,
    version: Number(row.edit_version),
    updatedAt: row.updated_at
  };
}

export async function readSellerListingLifecycle(input: {
  userId: string;
  listingId: string;
  now?: Date;
}) {
  const configuration = resolveListingLifecycleConfiguration();
  const now = input.now ?? new Date();
  const listing = await db.selectFrom('listings')
    .select([
      'id',
      'title',
      'seller_id',
      'status',
      'availability_status',
      'available_quantity',
      'expires_at',
      'last_renewed_at',
      'edit_version',
      'updated_at'
    ])
    .where('id', '=', input.listingId)
    .where('seller_id', '=', input.userId)
    .executeTakeFirst();

  if (!listing) {
    throw new ListingLifecycleError('listing_not_found', 404, 'Listing not found');
  }

  const status = String(listing.status);
  const renewalAt = renewalAvailableAt(listing.expires_at ?? null, configuration.renewalWindowDays);
  const stockReady = canPublishInventory({
    availabilityStatus: String(listing.availability_status),
    availableQuantity: listing.available_quantity === null ? null : Number(listing.available_quantity)
  });
  const renewable = status === 'expired'
    ? stockReady
    : status === 'active' && stockReady && (!renewalAt || now.getTime() >= renewalAt.getTime());

  return {
    listing: serializeLifecycleListing(listing),
    renewable,
    renewalAvailableAt: renewalAt?.toISOString() ?? null,
    activeDays: configuration.activeDays
  };
}

export async function renewOrReactivateListing(input: {
  userId: string;
  listingId: string;
  version: number;
  now?: Date;
}) {
  const configuration = resolveListingLifecycleConfiguration();
  const now = input.now ?? new Date();

  return db.transaction().execute(async (transaction) => {
    const listing = await transaction.selectFrom('listings')
      .selectAll()
      .where('id', '=', input.listingId)
      .where('seller_id', '=', input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (!listing) {
      throw new ListingLifecycleError('listing_not_found', 404, 'Listing not found');
    }
    if (Number(listing.edit_version) !== input.version) {
      throw new ListingLifecycleError(
        'listing_conflict',
        409,
        'Listing changed; reload before renewing',
        { currentVersion: Number(listing.edit_version), currentStatus: String(listing.status) }
      );
    }

    const status = String(listing.status);
    if (status !== 'active' && status !== 'expired') {
      throw new ListingLifecycleError(
        'listing_not_renewable',
        409,
        'Listing cannot be renewed in its current status',
        { currentVersion: Number(listing.edit_version), currentStatus: status }
      );
    }
    if (!canPublishInventory({
      availabilityStatus: String(listing.availability_status),
      availableQuantity: listing.available_quantity === null ? null : Number(listing.available_quantity)
    })) {
      throw new ListingLifecycleError(
        'listing_out_of_stock',
        409,
        'Add available inventory before reactivating this listing',
        { currentVersion: Number(listing.edit_version), currentStatus: status }
      );
    }

    if (status === 'active') {
      const renewalAt = renewalAvailableAt(listing.expires_at ?? null, configuration.renewalWindowDays);
      if (renewalAt && now.getTime() < renewalAt.getTime()) {
        throw new ListingLifecycleError(
          'renewal_too_early',
          409,
          'Listing is not yet within its renewal window',
          {
            currentVersion: Number(listing.edit_version),
            currentStatus: status,
            renewalAvailableAt: renewalAt.toISOString()
          }
        );
      }
    }

    const nextExpiry = listingExpiryFrom(now, configuration.activeDays);
    const updated = await transaction.updateTable('listings')
      .set({
        status: 'active',
        published_at: status === 'expired' ? now : listing.published_at,
        expires_at: nextExpiry,
        last_renewed_at: now,
        updated_at: now
      })
      .where('id', '=', listing.id)
      .where('seller_id', '=', input.userId)
      .where('edit_version', '=', input.version)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw new ListingLifecycleError(
        'listing_conflict',
        409,
        'Listing changed; reload before renewing'
      );
    }

    await transaction.insertInto('audit_logs').values({
      actor_user_id: input.userId,
      action: status === 'expired' ? 'listing.reactivated' : 'listing.renewed',
      entity_type: 'listing',
      entity_id: listing.id,
      metadata: {
        previousStatus: status,
        expiresAt: nextExpiry.toISOString(),
        version: Number(updated.edit_version)
      },
      created_at: now
    }).execute();

    return {
      listing: serializeLifecycleListing(updated),
      reactivated: status === 'expired'
    };
  });
}

async function expireDueListings(now: Date, batchSize: number): Promise<string[]> {
  return db.transaction().execute(async (transaction) => {
    const due = await transaction.selectFrom('listings')
      .select(['id'])
      .where('status', '=', 'active')
      .where('expires_at', 'is not', null)
      .where('expires_at', '<=', now)
      .orderBy('expires_at', 'asc')
      .limit(batchSize)
      .forUpdate()
      .skipLocked()
      .execute();

    const ids: string[] = [];
    for (const row of due) {
      const updated = await transaction.updateTable('listings')
        .set({ status: 'expired', updated_at: now })
        .where('id', '=', row.id)
        .where('status', '=', 'active')
        .where('expires_at', '<=', now)
        .returning(['id'])
        .executeTakeFirst();
      if (!updated) continue;

      ids.push(String(updated.id));
      await transaction.updateTable('offers')
        .set({ status: 'expired', updated_at: now })
        .where('listing_id', '=', updated.id)
        .where('status', '=', 'pending')
        .execute();
      await transaction.insertInto('audit_logs').values({
        actor_user_id: null,
        action: 'listing.expired',
        entity_type: 'listing',
        entity_id: updated.id,
        metadata: { source: 'lifecycle_worker' },
        created_at: now
      }).execute();
    }
    return ids;
  });
}

async function releaseAbandonedReservations(now: Date, batchSize: number): Promise<string[]> {
  const due = await db.selectFrom('listing_inventory_reservations')
    .select(['offer_id'])
    .where('status', '=', 'reserved')
    .where('order_id', 'is', null)
    .where('expires_at', 'is not', null)
    .where('expires_at', '<=', now)
    .orderBy('expires_at', 'asc')
    .limit(batchSize)
    .execute();

  const released: string[] = [];
  for (const row of due) {
    await db.transaction().execute(async (transaction) => {
      const offer = await transaction.selectFrom('offers')
        .select(['id', 'status'])
        .where('id', '=', row.offer_id)
        .forUpdate()
        .executeTakeFirst();
      if (!offer || offer.status !== 'accepted') {
        return;
      }
      const transactionOrder = await transaction.selectFrom('transactions')
        .select(['id'])
        .where('offer_id', '=', offer.id)
        .executeTakeFirst();
      if (transactionOrder) {
        await transaction.updateTable('listing_inventory_reservations')
          .set({ order_id: transactionOrder.id, expires_at: null, updated_at: now })
          .where('offer_id', '=', offer.id)
          .where('status', '=', 'reserved')
          .execute();
        return;
      }

      const result = await releaseInventoryReservation({
        transaction,
        offerId: offer.id,
        reason: 'reservation_expired',
        now
      });
      if (result.unchanged) return;

      await transaction.updateTable('offers')
        .set({ status: 'expired', updated_at: now })
        .where('id', '=', offer.id)
        .where('status', '=', 'accepted')
        .execute();
      await transaction.insertInto('audit_logs').values({
        actor_user_id: null,
        action: 'listing.inventory_reservation_expired',
        entity_type: 'offer',
        entity_id: offer.id,
        metadata: { source: 'lifecycle_worker' },
        created_at: now
      }).execute();
      released.push(String(offer.id));
    });
  }
  return released;
}

export async function runListingLifecycleSweep(now = new Date()) {
  const configuration = resolveListingLifecycleConfiguration();
  const lockResult = await sql<{ locked: boolean }>`select pg_try_advisory_lock(73115015) as locked`.execute(db);
  const locked = Boolean(lockResult.rows[0]?.locked);
  if (!locked) {
    return { acquired: false, expiredListingIds: [], releasedOfferIds: [] };
  }

  try {
    const expiredListingIds = await expireDueListings(now, configuration.batchSize);
    const releasedOfferIds = await releaseAbandonedReservations(now, configuration.batchSize);
    return { acquired: true, expiredListingIds, releasedOfferIds };
  } finally {
    await sql`select pg_advisory_unlock(73115015)`.execute(db);
  }
}
