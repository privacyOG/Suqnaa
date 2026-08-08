import assert from 'node:assert/strict';
import {
  decodeListingSearchCursor,
  encodeListingSearchCursor,
  listingSearchFilterFingerprint,
  publicListingSearchQuery
} from './listing-search-policy.js';

const listingId = '123e4567-e89b-42d3-a456-426614174000';

const newest = publicListingSearchQuery.parse({
  q: '  gaming laptop  ',
  categoryId: listingId,
  condition: 'good',
  availabilityStatus: 'in_stock',
  country: 'au',
  region: 'NSW',
  city: 'Sydney',
  suburb: 'Greenacre',
  fulfilment: 'both'
});

assert.equal(newest.q, 'gaming laptop');
assert.equal(newest.country, 'AU');
assert.equal(newest.sort, 'newest');
assert.equal(newest.fulfilment, 'both');
assert.equal(listingSearchFilterFingerprint(newest).length, 32);

const newestCursor = encodeListingSearchCursor(newest, {
  createdAt: '2026-07-21T10:00:00.000Z',
  id: listingId
});
assert.match(newestCursor, /^ls1\./);
assert.deepEqual(decodeListingSearchCursor(newestCursor, newest), {
  kind: 'opaque',
  sort: 'newest',
  createdAt: new Date('2026-07-21T10:00:00.000Z'),
  id: listingId,
  price: undefined,
  distanceMeters: undefined
});

assert.deepEqual(
  decodeListingSearchCursor('2026-07-21T10:00:00.000Z', newest),
  {
    kind: 'legacy',
    createdAt: new Date('2026-07-21T10:00:00.000Z')
  }
);

const priceAscending = publicListingSearchQuery.parse({
  sort: 'price_asc',
  currency: 'aud',
  minPrice: '10.50',
  maxPrice: '2000'
});
assert.equal(priceAscending.currency, 'AUD');
assert.equal(priceAscending.minPrice, 10.5);

const priceCursor = encodeListingSearchCursor(priceAscending, {
  createdAt: '2026-07-21T09:00:00.000Z',
  id: listingId,
  price: '199.95'
});
assert.deepEqual(decodeListingSearchCursor(priceCursor, priceAscending), {
  kind: 'opaque',
  sort: 'price_asc',
  createdAt: new Date('2026-07-21T09:00:00.000Z'),
  id: listingId,
  price: '199.95',
  distanceMeters: undefined
});

const nearby = publicListingSearchQuery.parse({
  nearLat: '-33.8688197',
  nearLon: '151.2092955',
  radiusKm: '25',
  sort: 'distance'
});
assert.equal(nearby.nearLat, -33.87);
assert.equal(nearby.nearLon, 151.21);
assert.equal(nearby.radiusKm, 25);
assert.equal(nearby.sort, 'distance');

const distanceCursor = encodeListingSearchCursor(nearby, {
  createdAt: '2026-07-21T08:00:00.000Z',
  id: listingId,
  distanceMeters: 1234.567
});
assert.deepEqual(decodeListingSearchCursor(distanceCursor, nearby), {
  kind: 'opaque',
  sort: 'distance',
  createdAt: new Date('2026-07-21T08:00:00.000Z'),
  id: listingId,
  price: undefined,
  distanceMeters: 1234.567
});
assert.notEqual(
  listingSearchFilterFingerprint(nearby),
  listingSearchFilterFingerprint(publicListingSearchQuery.parse({
    nearLat: -33.87,
    nearLon: 151.21,
    radiusKm: 50,
    sort: 'distance'
  }))
);

assert.throws(
  () => publicListingSearchQuery.parse({ minPrice: 10 }),
  /Currency is required/
);
assert.throws(
  () => publicListingSearchQuery.parse({ sort: 'price_desc' }),
  /Currency is required/
);
assert.throws(
  () => publicListingSearchQuery.parse({ minPrice: 20, maxPrice: 10, currency: 'AUD' }),
  /Maximum price/
);
assert.throws(
  () => publicListingSearchQuery.parse({ nearLat: -33.87, radiusKm: 20 }),
  /provided together/
);
assert.throws(
  () => publicListingSearchQuery.parse({ sort: 'distance' }),
  /Distance sorting requires/
);
assert.throws(
  () => publicListingSearchQuery.parse({ nearLat: -33.87, nearLon: 151.21, radiusKm: 501 }),
  /less than or equal to 500/
);
assert.throws(
  () => decodeListingSearchCursor(priceCursor, {
    ...priceAscending,
    city: 'Melbourne'
  }),
  /does not match/
);
assert.throws(
  () => decodeListingSearchCursor(priceCursor, {
    ...priceAscending,
    sort: 'price_desc'
  }),
  /does not match/
);
assert.throws(
  () => decodeListingSearchCursor(distanceCursor, {
    ...nearby,
    radiusKm: 30
  }),
  /does not match/
);
assert.throws(
  () => decodeListingSearchCursor('not-a-cursor', newest),
  /Invalid listing search cursor/
);
assert.throws(
  () => decodeListingSearchCursor('2026-07-21T10:00:00.000Z', priceAscending),
  /newest sorting/
);

console.log('Listing search policy tests passed.');
