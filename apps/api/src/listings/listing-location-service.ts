import { sql } from 'kysely';
import { db } from '../db/index.js';
import { editableListingStatuses } from './listing-edit-service.js';
import {
  listingLocationGeography,
  optionalApproximateListingLocation,
  type ApproximateListingLocation
} from './listing-location.js';

export class ListingLocationError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly currentVersion?: number,
    public readonly currentStatus?: string
  ) {
    super(message);
  }
}

interface ListingLocationRow {
  id: string;
  status: string;
  edit_version: number;
  approximate_latitude: number | string | null;
  approximate_longitude: number | string | null;
}

function serializeLocation(row: ListingLocationRow) {
  const hasLocation = row.approximate_latitude !== null && row.approximate_longitude !== null;
  return {
    listingId: String(row.id),
    status: String(row.status),
    version: Number(row.edit_version),
    approximateLocation: hasLocation
      ? {
          latitude: Number(row.approximate_latitude),
          longitude: Number(row.approximate_longitude)
        }
      : null,
    editable: editableListingStatuses.has(String(row.status))
  };
}

async function readLocationRow(userId: string, listingId: string) {
  return db.selectFrom('listings')
    .select([
      'id',
      'status',
      'edit_version',
      sql<number | null>`ST_Y(location::geometry)`.as('approximate_latitude'),
      sql<number | null>`ST_X(location::geometry)`.as('approximate_longitude')
    ])
    .where('id', '=', listingId)
    .where('seller_id', '=', userId)
    .executeTakeFirst() as Promise<ListingLocationRow | undefined>;
}

export async function readSellerListingLocation(userId: string, listingId: string) {
  const row = await readLocationRow(userId, listingId);
  if (!row) {
    throw new ListingLocationError('listing_not_found', 404, 'Listing not found');
  }
  return serializeLocation(row);
}

function locationsEqual(
  current: ReturnType<typeof serializeLocation>['approximateLocation'],
  requested: ApproximateListingLocation | null
): boolean {
  if (current === null || requested === null) return current === requested;
  return current.latitude === requested.latitude && current.longitude === requested.longitude;
}

export async function updateSellerListingLocation(input: {
  userId: string;
  listingId: string;
  version: number;
  approximateLocation: unknown;
}) {
  const requested = optionalApproximateListingLocation(input.approximateLocation);
  const existingRow = await readLocationRow(input.userId, input.listingId);
  if (!existingRow) {
    throw new ListingLocationError('listing_not_found', 404, 'Listing not found');
  }

  const existing = serializeLocation(existingRow);
  if (!existing.editable) {
    throw new ListingLocationError(
      'listing_not_editable',
      409,
      'Listing location cannot be edited in its current status',
      existing.version,
      existing.status
    );
  }
  if (existing.version !== input.version) {
    throw new ListingLocationError(
      'listing_conflict',
      409,
      'Listing changed; reload before saving location',
      existing.version,
      existing.status
    );
  }
  if (locationsEqual(existing.approximateLocation, requested)) {
    return { listing: existing, unchanged: true };
  }

  const updated = await db.updateTable('listings')
    .set({
      location: requested ? listingLocationGeography(requested) : null,
      updated_at: new Date()
    })
    .where('id', '=', input.listingId)
    .where('seller_id', '=', input.userId)
    .where('edit_version', '=', input.version)
    .where('status', 'in', [...editableListingStatuses])
    .returning([
      'id',
      'status',
      'edit_version',
      sql<number | null>`ST_Y(location::geometry)`.as('approximate_latitude'),
      sql<number | null>`ST_X(location::geometry)`.as('approximate_longitude')
    ])
    .executeTakeFirst() as ListingLocationRow | undefined;

  if (!updated) {
    const latest = await readLocationRow(input.userId, input.listingId);
    if (!latest) {
      throw new ListingLocationError('listing_not_found', 404, 'Listing not found');
    }
    const latestSnapshot = serializeLocation(latest);
    throw new ListingLocationError(
      latestSnapshot.editable ? 'listing_conflict' : 'listing_not_editable',
      409,
      latestSnapshot.editable
        ? 'Listing changed; reload before saving location'
        : 'Listing location cannot be edited in its current status',
      latestSnapshot.version,
      latestSnapshot.status
    );
  }

  return { listing: serializeLocation(updated), unchanged: false };
}
