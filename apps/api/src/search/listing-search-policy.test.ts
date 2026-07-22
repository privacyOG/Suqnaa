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
  price: undefined
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
  price: '199.95'
});

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
  () => decodeListingSearchCursor('not-a-cursor', newest),
  /Invalid listing search cursor/
);
assert.throws(
  () => decodeListingSearchCursor('2026-07-21T10:00:00.000Z', priceAscending),
  /newest sorting/
);
