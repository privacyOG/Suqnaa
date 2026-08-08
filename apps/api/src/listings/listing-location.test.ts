import assert from 'node:assert/strict';
import {
  coarseDistanceKm,
  listingLocationGridDegrees,
  maximumNearbyRadiusKm,
  normalizeApproximateListingLocation,
  optionalApproximateListingLocation
} from './listing-location.js';

assert.equal(listingLocationGridDegrees, 0.01);
assert.equal(maximumNearbyRadiusKm, 500);
assert.deepEqual(
  normalizeApproximateListingLocation({ latitude: -33.8688197, longitude: 151.2092955 }),
  { latitude: -33.87, longitude: 151.21 }
);
assert.deepEqual(
  normalizeApproximateListingLocation({ latitude: '-33.874', longitude: '151.204' }),
  { latitude: -33.87, longitude: 151.2 }
);
assert.equal(optionalApproximateListingLocation(null), null);
assert.throws(
  () => normalizeApproximateListingLocation({ latitude: -91, longitude: 151.2 }),
  /less than or equal to 90/
);
assert.throws(
  () => normalizeApproximateListingLocation({ latitude: -33.8, longitude: 181 }),
  /less than or equal to 180/
);
assert.equal(coarseDistanceKm(499), 0);
assert.equal(coarseDistanceKm(1499), 1);
assert.equal(coarseDistanceKm(1501), 2);
assert.equal(coarseDistanceKm(null), 0);
assert.equal(coarseDistanceKm('invalid'), null);

console.log('Listing location privacy policy tests passed.');
