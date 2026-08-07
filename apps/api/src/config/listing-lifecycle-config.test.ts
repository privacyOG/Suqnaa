import assert from 'node:assert/strict';
import {
  listingExpiryFrom,
  reservationExpiryFrom,
  resolveListingLifecycleConfiguration
} from './listing-lifecycle-config.js';

const defaults = resolveListingLifecycleConfiguration({});
assert.equal(defaults.activeDays, 30);
assert.equal(defaults.renewalWindowDays, 7);
assert.equal(defaults.reservationMinutes, 60);
assert.equal(defaults.batchSize, 100);
assert.equal(defaults.workerIntervalSeconds, 60);

const configured = resolveListingLifecycleConfiguration({
  LISTING_ACTIVE_DAYS: '45',
  LISTING_RENEWAL_WINDOW_DAYS: '5',
  LISTING_RESERVATION_MINUTES: '90',
  LISTING_LIFECYCLE_BATCH_SIZE: '250',
  LISTING_LIFECYCLE_INTERVAL_SECONDS: '120'
});
assert.deepEqual(configured, {
  activeDays: 45,
  renewalWindowDays: 5,
  reservationMinutes: 90,
  batchSize: 250,
  workerIntervalSeconds: 120
});

assert.throws(
  () => resolveListingLifecycleConfiguration({
    LISTING_ACTIVE_DAYS: '5',
    LISTING_RENEWAL_WINDOW_DAYS: '10'
  }),
  /renewal window/i
);
assert.throws(
  () => resolveListingLifecycleConfiguration({ LISTING_ACTIVE_DAYS: '0' })
);
assert.throws(
  () => resolveListingLifecycleConfiguration({ LISTING_LIFECYCLE_BATCH_SIZE: '1001' })
);

const anchor = new Date('2026-08-08T00:00:00.000Z');
assert.equal(
  listingExpiryFrom(anchor, 30).toISOString(),
  '2026-09-07T00:00:00.000Z'
);
assert.equal(
  reservationExpiryFrom(anchor, 60).toISOString(),
  '2026-08-08T01:00:00.000Z'
);

console.log('Listing lifecycle configuration tests passed.');
