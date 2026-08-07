import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  createSavedSearch,
  DiscoveryConflictError,
  getListingDiscoveryState,
  listRecentlyViewed,
  listSavedListings,
  listSavedSearchNotifications,
  listSavedSearches,
  listWatchlist,
  markAllSavedSearchNotificationsRead,
  markSavedSearchNotificationRead,
  recordRecentlyViewed,
  removeSavedListing,
  removeWatchedListing,
  runSavedSearchNotificationSweep,
  saveListing,
  updateSavedSearch,
  watchListing
} from './discovery-service.js';

const sellerId = randomUUID();
const viewerId = randomUUID();
const otherSellerId = randomUUID();
const baseTime = new Date('2026-08-08T00:00:00.000Z');

async function insertListing(input: {
  id?: string;
  sellerId?: string;
  title: string;
  updatedAt?: Date;
  city?: string;
  price?: string;
}) {
  const id = input.id ?? randomUUID();
  const updatedAt = input.updatedAt ?? baseTime;
  await db.insertInto('listings').values({
    id,
    seller_id: input.sellerId ?? sellerId,
    title: input.title,
    description: `${input.title} discovery database integration test record.`,
    price_amount: input.price ?? '100.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'active',
    country_code: 'AU',
    region: 'NSW',
    city: input.city ?? 'Sydney',
    suburb: 'Greenacre',
    allow_pickup: true,
    allow_delivery: true,
    published_at: updatedAt,
    expires_at: new Date(updatedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    created_at: updatedAt,
    updated_at: updatedAt
  }).execute();
  return id;
}

try {
  await db.insertInto('users').values([
    {
      id: sellerId,
      email: `discovery-seller-${sellerId}@example.test`,
      display_name: 'Discovery Seller',
      status: 'active',
      email_verified_at: baseTime,
      created_at: baseTime,
      updated_at: baseTime
    },
    {
      id: viewerId,
      email: `discovery-viewer-${viewerId}@example.test`,
      display_name: 'Discovery Viewer',
      status: 'active',
      email_verified_at: baseTime,
      created_at: baseTime,
      updated_at: baseTime
    },
    {
      id: otherSellerId,
      email: `discovery-other-${otherSellerId}@example.test`,
      display_name: 'Other Seller',
      status: 'active',
      email_verified_at: baseTime,
      created_at: baseTime,
      updated_at: baseTime
    }
  ]).execute();

  const listingId = await insertListing({ title: 'Saved gaming laptop' });

  assert.deepEqual(await getListingDiscoveryState(viewerId, listingId), {
    listingId,
    saved: false,
    watching: false
  });

  assert.deepEqual(await saveListing(viewerId, listingId), {
    listingId,
    unchanged: false
  });
  assert.equal((await saveListing(viewerId, listingId)).unchanged, true);
  assert.equal((await listSavedListings(viewerId))[0]?.listingId, listingId);

  assert.equal((await watchListing(viewerId, listingId)).unchanged, false);
  assert.equal((await watchListing(viewerId, listingId)).unchanged, true);
  assert.equal((await listWatchlist(viewerId))[0]?.listingId, listingId);
  assert.deepEqual(await getListingDiscoveryState(viewerId, listingId), {
    listingId,
    saved: true,
    watching: true
  });

  assert.equal((await removeSavedListing(viewerId, listingId)).unchanged, false);
  assert.equal((await removeSavedListing(viewerId, listingId)).unchanged, true);
  assert.equal((await removeWatchedListing(viewerId, listingId)).unchanged, false);
  assert.equal((await removeWatchedListing(viewerId, listingId)).unchanged, true);

  await recordRecentlyViewed(viewerId, listingId);
  await recordRecentlyViewed(viewerId, listingId);
  const recent = await listRecentlyViewed(viewerId);
  assert.equal(recent.length, 1);
  assert.equal(recent[0]?.listingId, listingId);
  assert.equal(recent[0]?.viewCount, 2);

  const search = await createSavedSearch(viewerId, {
    name: 'Sydney laptops',
    filters: {
      q: 'gaming laptop',
      currency: 'aud',
      country: 'au',
      city: ' Sydney ',
      fulfilment: 'both'
    }
  });
  assert.equal(search.name, 'Sydney laptops');
  assert.equal((search.filters as Record<string, unknown>).currency, 'AUD');
  assert.equal((search.filters as Record<string, unknown>).country, 'AU');
  assert.equal((search.filters as Record<string, unknown>).city, 'Sydney');

  await assert.rejects(
    () => createSavedSearch(viewerId, {
      name: 'Duplicate normalized search',
      filters: {
        q: ' gaming laptop ',
        currency: 'AUD',
        country: 'AU',
        city: 'Sydney',
        fulfilment: 'both'
      }
    }),
    DiscoveryConflictError
  );

  const beforeSearchMatch = await insertListing({
    sellerId: otherSellerId,
    title: 'Gaming laptop older match',
    updatedAt: new Date(baseTime.getTime() - 1000)
  });
  const firstSweep = await runSavedSearchNotificationSweep(
    new Date(baseTime.getTime() + 60_000)
  );
  assert.equal(firstSweep.acquired, true);
  assert.equal((await listSavedSearchNotifications(viewerId)).length, 0);

  const matchTime = new Date(baseTime.getTime() + 120_000);
  const matchingListingId = await insertListing({
    sellerId: otherSellerId,
    title: 'Gaming laptop fresh match',
    updatedAt: matchTime
  });
  const nonmatchingListingId = await insertListing({
    sellerId: otherSellerId,
    title: 'Dining table fresh listing',
    updatedAt: matchTime,
    city: 'Sydney'
  });
  const ownListingId = await insertListing({
    sellerId: viewerId,
    title: 'Gaming laptop owned by viewer',
    updatedAt: matchTime
  });

  const secondSweep = await runSavedSearchNotificationSweep(
    new Date(baseTime.getTime() + 180_000)
  );
  assert.equal(secondSweep.acquired, true);
  const notifications = await listSavedSearchNotifications(viewerId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.listingId, matchingListingId);
  assert.notEqual(notifications[0]?.listingId, nonmatchingListingId);
  assert.notEqual(notifications[0]?.listingId, ownListingId);
  assert.notEqual(notifications[0]?.listingId, beforeSearchMatch);

  await runSavedSearchNotificationSweep(new Date(baseTime.getTime() + 240_000));
  assert.equal((await listSavedSearchNotifications(viewerId)).length, 1);

  const notificationId = String(notifications[0]?.id);
  const marked = await markSavedSearchNotificationRead(viewerId, notificationId);
  assert.equal(marked.unchanged, false);
  assert.equal((await markSavedSearchNotificationRead(viewerId, notificationId)).unchanged, true);
  assert.equal((await listSavedSearchNotifications(viewerId, { unreadOnly: true })).length, 0);

  const updatedSearch = await updateSavedSearch(viewerId, String(search.id), {
    filters: { country: 'au', city: 'Melbourne' },
    active: true
  });
  assert.equal((updatedSearch.filters as Record<string, unknown>).city, 'Melbourne');
  assert.equal((await listSavedSearchNotifications(viewerId)).length, 0);

  await updateSavedSearch(viewerId, String(search.id), { active: false });
  assert.equal((await listSavedSearches(viewerId))[0]?.active, false);
  await updateSavedSearch(viewerId, String(search.id), { active: true });
  assert.equal((await listSavedSearches(viewerId))[0]?.active, true);

  const allRead = await markAllSavedSearchNotificationsRead(viewerId);
  assert.equal(allRead.updated, 0);

  console.log('Discovery persistence and saved-search notification tests passed.');
} finally {
  await db.deleteFrom('saved_search_notifications').where('user_id', '=', viewerId).execute();
  await db.deleteFrom('saved_searches').where('user_id', '=', viewerId).execute();
  await db.deleteFrom('recently_viewed_listings').where('user_id', '=', viewerId).execute();
  await db.deleteFrom('listing_watchlist').where('user_id', '=', viewerId).execute();
  await db.deleteFrom('saved_listings').where('user_id', '=', viewerId).execute();
  await db.deleteFrom('listings').where('seller_id', 'in', [sellerId, viewerId, otherSellerId]).execute();
  await db.deleteFrom('users').where('id', 'in', [sellerId, viewerId, otherSellerId]).execute();
  await closeDb();
}
