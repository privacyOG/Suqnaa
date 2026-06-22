import assert from 'node:assert/strict';
import {
  InMemoryRateLimitStore,
  checkRateLimit,
  cleanupExpiredRateLimits
} from './rate-limit.js';

const store = new InMemoryRateLimitStore();
const policy = {
  group: 'test.action',
  identifiers: ['account:test-user'],
  limit: 2,
  windowMs: 1000,
  store
};

const first = checkRateLimit({ ...policy, now: 1000 });
const second = checkRateLimit({ ...policy, now: 1001 });
const third = checkRateLimit({ ...policy, now: 1002 });

assert.equal(first.allowed, true);
assert.equal(first.remaining, 1);
assert.equal(second.allowed, true);
assert.equal(second.remaining, 0);
assert.equal(third.allowed, false);
assert.equal(third.retryAfterSeconds, 1);

const removed = cleanupExpiredRateLimits(store, 2000);
assert.equal(removed, 1);

const afterReset = checkRateLimit({ ...policy, now: 2001 });
assert.equal(afterReset.allowed, true);
assert.equal(afterReset.remaining, 1);

const boundedStore = new InMemoryRateLimitStore({ maxEntries: 2 });

checkRateLimit({
  group: 'capacity',
  identifiers: ['first'],
  limit: 5,
  windowMs: 1000,
  now: 1000,
  store: boundedStore
});
checkRateLimit({
  group: 'capacity',
  identifiers: ['second'],
  limit: 5,
  windowMs: 1000,
  now: 1001,
  store: boundedStore
});
checkRateLimit({
  group: 'capacity',
  identifiers: ['third'],
  limit: 5,
  windowMs: 1000,
  now: 1002,
  store: boundedStore
});

assert.equal(boundedStore.size, 2);
assert.equal(boundedStore.get('capacity:first'), undefined);
assert.notEqual(boundedStore.get('capacity:second'), undefined);
assert.notEqual(boundedStore.get('capacity:third'), undefined);

assert.throws(
  () => new InMemoryRateLimitStore({ maxEntries: 0 }),
  /maxEntries must be a positive integer/
);
