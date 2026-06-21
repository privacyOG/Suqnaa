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

if (!first.allowed || first.remaining !== 1) {
  throw new Error('First request should be allowed with one request remaining');
}

if (!second.allowed || second.remaining !== 0) {
  throw new Error('Second request should consume the final allowance');
}

if (third.allowed || third.retryAfterSeconds !== 1) {
  throw new Error('Third request should be rate limited');
}

const removed = cleanupExpiredRateLimits(store, 2000);
if (removed !== 1) {
  throw new Error('Expired limiter counter should be removed');
}

const afterReset = checkRateLimit({ ...policy, now: 2001 });
if (!afterReset.allowed || afterReset.remaining !== 1) {
  throw new Error('Allowance should reset after counter expiry');
}
