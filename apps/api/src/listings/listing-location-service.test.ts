import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  ListingLocationError,
  readSellerListingLocation,
  updateSellerListingLocation
} from './listing-location-service.js';

const ownerId = randomUUID();
const otherId = randomUUID();
const listingId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values([
    {
      id: ownerId,
      email: `map-owner-${ownerId}@example.test`,
      display_name: 'Map Owner',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: otherId,
      email: `map-other-${otherId}@example.test`,
      display_name: 'Other Account',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: ownerId,
    title: 'Map point test',
    description: 'Database integration coverage for approximate listing map points.',
    price_amount: '10.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'draft',
    country_code: 'AU',
    allow_pickup: true,
    allow_delivery: false,
    created_at: now,
    updated_at: now
  }).execute();

  const initial = await readSellerListingLocation(ownerId, listingId);
  assert.equal(initial.version, 1);
  assert.equal(initial.approximateLocation, null);
  assert.equal(initial.editable, true);

  await assert.rejects(
    () => readSellerListingLocation(otherId, listingId),
    (error: unknown) => error instanceof ListingLocationError && error.statusCode === 404
  );

  const changed = await updateSellerListingLocation({
    userId: ownerId,
    listingId,
    version: 1,
    approximateLocation: { latitude: -20.1234, longitude: 130.5678 }
  });
  assert.equal(changed.unchanged, false);
  assert.equal(changed.listing.version, 2);
  assert.deepEqual(changed.listing.approximateLocation, {
    latitude: -20.12,
    longitude: 130.57
  });

  const noOp = await updateSellerListingLocation({
    userId: ownerId,
    listingId,
    version: 2,
    approximateLocation: { latitude: -20.121, longitude: 130.571 }
  });
  assert.equal(noOp.unchanged, true);
  assert.equal(noOp.listing.version, 2);

  await assert.rejects(
    () => updateSellerListingLocation({
      userId: ownerId,
      listingId,
      version: 1,
      approximateLocation: null
    }),
    (error: unknown) => error instanceof ListingLocationError && error.code === 'listing_conflict'
  );

  const cleared = await updateSellerListingLocation({
    userId: ownerId,
    listingId,
    version: 2,
    approximateLocation: null
  });
  assert.equal(cleared.listing.version, 3);
  assert.equal(cleared.listing.approximateLocation, null);

  await db.updateTable('listings')
    .set({ status: 'reserved', updated_at: new Date() })
    .where('id', '=', listingId)
    .execute();
  const locked = await readSellerListingLocation(ownerId, listingId);
  assert.equal(locked.editable, false);

  console.log('Seller listing location service tests passed.');
} finally {
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  await db.deleteFrom('users').where('id', 'in', [ownerId, otherId]).execute();
  await closeDb();
}
