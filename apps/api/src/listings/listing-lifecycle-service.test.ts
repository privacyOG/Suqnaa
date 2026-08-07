import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  ListingLifecycleError,
  renewOrReactivateListing,
  runListingLifecycleSweep
} from './listing-lifecycle-service.js';

const sellerId = randomUUID();
const buyerId = randomUUID();
const now = new Date('2026-08-08T00:00:00.000Z');

async function insertListing(input: {
  id: string;
  quantity: number | null;
  availability?: string;
  status?: string;
  expiresAt?: Date | null;
}) {
  await db.insertInto('listings').values({
    id: input.id,
    seller_id: sellerId,
    title: `Lifecycle ${input.id}`,
    description: 'Listing lifecycle database integration test record.',
    price_amount: '100.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: input.availability ?? 'in_stock',
    available_quantity: input.quantity,
    status: input.status ?? 'active',
    country_code: 'AU',
    allow_pickup: true,
    allow_delivery: false,
    published_at: now,
    expires_at: input.expiresAt === undefined
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      : input.expiresAt,
    created_at: now,
    updated_at: now
  }).execute();
}

async function insertOffer(listingId: string, offerId = randomUUID()) {
  await db.insertInto('offers').values({
    id: offerId,
    listing_id: listingId,
    buyer_id: buyerId,
    amount: '90.00',
    currency_code: 'AUD',
    status: 'pending',
    client_offer_id: randomUUID(),
    created_at: now,
    updated_at: now
  }).execute();
  return offerId;
}

try {
  await db.insertInto('users').values([
    {
      id: sellerId,
      email: `lifecycle-seller-${sellerId}@example.test`,
      display_name: 'Lifecycle Seller',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: buyerId,
      email: `lifecycle-buyer-${buyerId}@example.test`,
      display_name: 'Lifecycle Buyer',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  const finiteListingId = randomUUID();
  await insertListing({ id: finiteListingId, quantity: 2, availability: 'limited' });
  const finiteOfferId = await insertOffer(finiteListingId);
  await db.updateTable('offers')
    .set({ status: 'accepted', updated_at: now })
    .where('id', '=', finiteOfferId)
    .execute();

  const reservedFinite = await db.selectFrom('listings')
    .select(['status', 'availability_status', 'available_quantity', 'edit_version'])
    .where('id', '=', finiteListingId)
    .executeTakeFirstOrThrow();
  assert.equal(reservedFinite.status, 'reserved');
  assert.equal(reservedFinite.availability_status, 'limited');
  assert.equal(Number(reservedFinite.available_quantity), 1);
  assert.ok(Number(reservedFinite.edit_version) > 1);

  const reservation = await db.selectFrom('listing_inventory_reservations')
    .selectAll()
    .where('offer_id', '=', finiteOfferId)
    .executeTakeFirstOrThrow();
  assert.equal(Number(reservation.quantity), 1);
  assert.equal(reservation.previous_availability_status, 'limited');
  assert.equal(reservation.status, 'reserved');
  assert.ok(reservation.expires_at);

  const orderId = randomUUID();
  await db.insertInto('transactions').values({
    id: orderId,
    listing_id: finiteListingId,
    offer_id: finiteOfferId,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount: '90.00',
    currency_code: 'AUD',
    status: 'pending',
    payment_method: 'card',
    client_order_id: randomUUID(),
    created_at: now,
    updated_at: now
  }).execute();

  const attached = await db.selectFrom('listing_inventory_reservations')
    .select(['order_id', 'expires_at'])
    .where('offer_id', '=', finiteOfferId)
    .executeTakeFirstOrThrow();
  assert.equal(attached.order_id, orderId);
  assert.equal(attached.expires_at, null);

  await db.updateTable('transactions')
    .set({ status: 'cancelled', updated_at: new Date(now.getTime() + 1000) })
    .where('id', '=', orderId)
    .execute();
  const restored = await db.selectFrom('listings')
    .select(['available_quantity', 'availability_status', 'status'])
    .where('id', '=', finiteListingId)
    .executeTakeFirstOrThrow();
  assert.equal(Number(restored.available_quantity), 2);
  assert.equal(restored.availability_status, 'limited');
  assert.equal(restored.status, 'reserved');
  const released = await db.selectFrom('listing_inventory_reservations')
    .select(['status', 'release_reason'])
    .where('offer_id', '=', finiteOfferId)
    .executeTakeFirstOrThrow();
  assert.equal(released.status, 'released');
  assert.equal(released.release_reason, 'order_cancelled');

  await db.updateTable('listings')
    .set({ status: 'active', updated_at: new Date(now.getTime() + 2000) })
    .where('id', '=', finiteListingId)
    .execute();
  assert.equal(
    (await db.selectFrom('listings').select('status').where('id', '=', finiteListingId).executeTakeFirstOrThrow()).status,
    'active'
  );

  const soldOutListingId = randomUUID();
  await insertListing({ id: soldOutListingId, quantity: 1 });
  const soldOutOfferId = await insertOffer(soldOutListingId);
  await db.updateTable('offers')
    .set({ status: 'accepted', updated_at: now })
    .where('id', '=', soldOutOfferId)
    .execute();
  const soldOut = await db.selectFrom('listings')
    .select(['status', 'availability_status', 'available_quantity'])
    .where('id', '=', soldOutListingId)
    .executeTakeFirstOrThrow();
  assert.equal(soldOut.status, 'reserved');
  assert.equal(soldOut.availability_status, 'out_of_stock');
  assert.equal(Number(soldOut.available_quantity), 0);

  const serviceListingId = randomUUID();
  await insertListing({
    id: serviceListingId,
    quantity: null,
    availability: 'service_available'
  });
  const serviceOfferId = await insertOffer(serviceListingId);
  await db.updateTable('offers')
    .set({ status: 'accepted', updated_at: now })
    .where('id', '=', serviceOfferId)
    .execute();
  const serviceReservation = await db.selectFrom('listing_inventory_reservations')
    .select(['quantity', 'previous_availability_status'])
    .where('offer_id', '=', serviceOfferId)
    .executeTakeFirstOrThrow();
  assert.equal(Number(serviceReservation.quantity), 0);
  assert.equal(serviceReservation.previous_availability_status, 'service_available');

  const expiringListingId = randomUUID();
  await insertListing({
    id: expiringListingId,
    quantity: 3,
    expiresAt: new Date(now.getTime() - 1000)
  });
  const pendingOfferId = await insertOffer(expiringListingId);
  const sweep = await runListingLifecycleSweep(now);
  assert.equal(sweep.acquired, true);
  assert.ok(sweep.expiredListingIds.includes(expiringListingId));
  assert.equal(
    (await db.selectFrom('listings').select('status').where('id', '=', expiringListingId).executeTakeFirstOrThrow()).status,
    'expired'
  );
  assert.equal(
    (await db.selectFrom('offers').select('status').where('id', '=', pendingOfferId).executeTakeFirstOrThrow()).status,
    'expired'
  );

  const abandonedListingId = randomUUID();
  await insertListing({ id: abandonedListingId, quantity: 1 });
  const abandonedOfferId = await insertOffer(abandonedListingId);
  await db.updateTable('offers')
    .set({ status: 'accepted', updated_at: now })
    .where('id', '=', abandonedOfferId)
    .execute();
  await db.updateTable('listing_inventory_reservations')
    .set({ expires_at: new Date(now.getTime() - 1000), updated_at: now })
    .where('offer_id', '=', abandonedOfferId)
    .execute();
  const abandonedSweep = await runListingLifecycleSweep(now);
  assert.equal(abandonedSweep.acquired, true);
  assert.ok(abandonedSweep.releasedOfferIds.includes(abandonedOfferId));
  const abandonedListing = await db.selectFrom('listings')
    .select(['status', 'availability_status', 'available_quantity'])
    .where('id', '=', abandonedListingId)
    .executeTakeFirstOrThrow();
  assert.equal(abandonedListing.status, 'active');
  assert.equal(abandonedListing.availability_status, 'in_stock');
  assert.equal(Number(abandonedListing.available_quantity), 1);
  assert.equal(
    (await db.selectFrom('offers').select('status').where('id', '=', abandonedOfferId).executeTakeFirstOrThrow()).status,
    'expired'
  );

  const renewableListingId = randomUUID();
  await insertListing({
    id: renewableListingId,
    quantity: 2,
    expiresAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
  });
  const renewable = await db.selectFrom('listings')
    .select(['edit_version'])
    .where('id', '=', renewableListingId)
    .executeTakeFirstOrThrow();
  const renewed = await renewOrReactivateListing({
    userId: sellerId,
    listingId: renewableListingId,
    version: Number(renewable.edit_version),
    now
  });
  assert.equal(renewed.reactivated, false);
  assert.equal(renewed.listing.status, 'active');
  assert.equal(new Date(renewed.listing.expiresAt).getTime(), now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const earlyListingId = randomUUID();
  await insertListing({
    id: earlyListingId,
    quantity: 2,
    expiresAt: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000)
  });
  const early = await db.selectFrom('listings')
    .select(['edit_version'])
    .where('id', '=', earlyListingId)
    .executeTakeFirstOrThrow();
  await assert.rejects(
    () => renewOrReactivateListing({
      userId: sellerId,
      listingId: earlyListingId,
      version: Number(early.edit_version),
      now
    }),
    (error: unknown) => error instanceof ListingLifecycleError && error.code === 'renewal_too_early'
  );

  const expiredListingId = randomUUID();
  await insertListing({
    id: expiredListingId,
    quantity: 4,
    status: 'expired',
    expiresAt: new Date(now.getTime() - 1000)
  });
  const expired = await db.selectFrom('listings')
    .select(['edit_version'])
    .where('id', '=', expiredListingId)
    .executeTakeFirstOrThrow();
  const reactivated = await renewOrReactivateListing({
    userId: sellerId,
    listingId: expiredListingId,
    version: Number(expired.edit_version),
    now
  });
  assert.equal(reactivated.reactivated, true);
  assert.equal(reactivated.listing.status, 'active');

  const emptyExpiredListingId = randomUUID();
  await insertListing({
    id: emptyExpiredListingId,
    quantity: 0,
    availability: 'out_of_stock',
    status: 'expired',
    expiresAt: new Date(now.getTime() - 1000)
  });
  const emptyExpired = await db.selectFrom('listings')
    .select(['edit_version'])
    .where('id', '=', emptyExpiredListingId)
    .executeTakeFirstOrThrow();
  await assert.rejects(
    () => renewOrReactivateListing({
      userId: sellerId,
      listingId: emptyExpiredListingId,
      version: Number(emptyExpired.edit_version),
      now
    }),
    (error: unknown) => error instanceof ListingLifecycleError && error.code === 'listing_out_of_stock'
  );

  console.log('Listing lifecycle and inventory service tests passed.');
} finally {
  const orderRows = await db.selectFrom('transactions')
    .select(['id'])
    .where('seller_id', '=', sellerId)
    .execute();
  const orderIds = orderRows.map((row) => String(row.id));
  if (orderIds.length > 0) {
    const paymentIntentRows = await db.selectFrom('payment_intents')
      .select(['id'])
      .where('transaction_id', 'in', orderIds)
      .execute();
    const paymentIntentIds = paymentIntentRows.map((row) => String(row.id));
    if (paymentIntentIds.length > 0) {
      await db.deleteFrom('fulfilments').where('payment_intent_id', 'in', paymentIntentIds).execute();
      await db.deleteFrom('payment_intents').where('id', 'in', paymentIntentIds).execute();
    }
    await db.deleteFrom('transactions').where('id', 'in', orderIds).execute();
  }
  await db.deleteFrom('offers').where('buyer_id', '=', buyerId).execute();
  await db.deleteFrom('listings').where('seller_id', '=', sellerId).execute();
  await db.deleteFrom('users').where('id', 'in', [sellerId, buyerId]).execute();
  await closeDb();
}
