import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import { listingLocationGeography } from '../listings/listing-location.js';
import {
  createSavedSearch,
  listSavedSearchNotifications,
  normalizeSavedSearchFilters,
  runSavedSearchNotificationSweep
} from './discovery-service.js';

const viewerId = randomUUID();
const sellerId = randomUUID();
const baseTime = new Date(Date.now() - 10 * 60 * 1000);

async function addListing(title: string, latitude: number, longitude: number) {
  const id = randomUUID();
  await db.insertInto('listings').values({
    id,
    seller_id: sellerId,
    title,
    description: `${title} spatial saved search test listing.`,
    price_amount: '100.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'active',
    country_code: 'AU',
    region: 'NSW',
    city: 'Sydney',
    location: listingLocationGeography({ latitude, longitude }),
    allow_pickup: true,
    allow_delivery: true,
    published_at: baseTime,
    expires_at: new Date(baseTime.getTime() + 30 * 24 * 60 * 60 * 1000),
    created_at: baseTime,
    updated_at: baseTime
  }).execute();
  return id;
}

try {
  await db.insertInto('users').values([
    {
      id: viewerId,
      email: `nearby-viewer-${viewerId}@example.test`,
      display_name: 'Nearby Viewer',
      status: 'active',
      email_verified_at: baseTime,
      created_at: baseTime,
      updated_at: baseTime
    },
    {
      id: sellerId,
      email: `nearby-seller-${sellerId}@example.test`,
      display_name: 'Nearby Seller',
      status: 'active',
      email_verified_at: baseTime,
      created_at: baseTime,
      updated_at: baseTime
    }
  ]).execute();

  const normalized = normalizeSavedSearchFilters({
    nearLat: -33.8688,
    nearLon: 151.2093,
    radiusKm: 20
  });
  assert.deepEqual(normalized.filters, {
    nearLat: -33.87,
    nearLon: 151.21,
    radiusKm: 20
  });

  const search = await createSavedSearch(viewerId, {
    name: 'Nearby only',
    filters: normalized.filters
  });
  const nearId = await addListing('Near match', -33.88, 151.2);
  await addListing('Far match', -37.81, 144.96);
  const eventTime = new Date(baseTime.getTime() + 2 * 60 * 1000);
  await db.updateTable('listings')
    .set({ updated_at: eventTime })
    .where('seller_id', '=', sellerId)
    .execute();
  await db.updateTable('saved_searches')
    .set({ last_evaluated_at: baseTime, last_evaluated_listing_id: null })
    .where('id', '=', search.id)
    .execute();

  const sweep = await runSavedSearchNotificationSweep(
    new Date(baseTime.getTime() + 3 * 60 * 1000)
  );
  assert.equal(sweep.acquired, true);
  assert.equal(sweep.matchesProcessed, 1);

  const notifications = await listSavedSearchNotifications(viewerId);
  assert.equal(notifications.length, 1);
  assert.equal(String(notifications[0]?.listingId), nearId);

  console.log('Saved nearby search notification tests passed.');
} finally {
  await db.deleteFrom('saved_search_notifications').where('user_id', '=', viewerId).execute();
  await db.deleteFrom('saved_searches').where('user_id', '=', viewerId).execute();
  await db.deleteFrom('listings').where('seller_id', '=', sellerId).execute();
  await db.deleteFrom('users').where('id', 'in', [viewerId, sellerId]).execute();
  await closeDb();
}
