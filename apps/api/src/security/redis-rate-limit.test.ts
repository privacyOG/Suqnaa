import assert from 'node:assert/strict';
import { RedisRateLimiter, type RedisEvalClient } from './redis-rate-limit.js';

class SharedFakeRedis implements RedisEvalClient {
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();
  now = 1000;
  lastKeys: string[] = [];

  async eval(_script: string, keys: string[], args: string[]): Promise<unknown> {
    this.lastKeys = keys;
    const limit = Number(args[0]);
    const windowMs = Number(args[1]);

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const existing = this.counters.get(key);
      if (existing && existing.expiresAt <= this.now) this.counters.delete(key);
      const current = this.counters.get(key);
      if (current && current.count >= limit) {
        return [0, 0, Math.max(1, current.expiresAt - this.now), index + 1];
      }
    }

    let highest = 0;
    let earliest = windowMs;
    for (const key of keys) {
      let counter = this.counters.get(key);
      if (!counter) {
        counter = { count: 0, expiresAt: this.now + windowMs };
        this.counters.set(key, counter);
      }
      counter.count += 1;
      highest = Math.max(highest, counter.count);
      earliest = Math.min(earliest, counter.expiresAt - this.now);
    }

    return [1, Math.max(0, limit - highest), earliest, 0];
  }
}

const redis = new SharedFakeRedis();
const firstInstance = new RedisRateLimiter({ client: redis });
const secondInstance = new RedisRateLimiter({ client: redis });

const input = {
  group: 'auth.login',
  identifiers: ['ip:203.0.113.10', 'email:user@example.test'],
  limit: 2,
  windowMs: 1000,
  now: 1000
};

const first = await firstInstance.check(input);
const second = await secondInstance.check(input);
const third = await firstInstance.check(input);

assert.equal(first.allowed, true);
assert.equal(first.remaining, 1);
assert.equal(second.allowed, true);
assert.equal(second.remaining, 0);
assert.equal(third.allowed, false);
assert.equal(third.retryAfterSeconds, 1);
assert.equal(third.limitedIdentifier, 'ip:203.0.113.10');

assert.equal(redis.lastKeys.length, 2);
assert.ok(redis.lastKeys.every((key) => key.startsWith('suqnaa:rate-limit:auth.login:')));
assert.ok(redis.lastKeys.every((key) => !key.includes('203.0.113.10')));
assert.ok(redis.lastKeys.every((key) => !key.includes('user@example.test')));

redis.now = 2001;
const reset = await secondInstance.check({ ...input, now: 2001 });
assert.equal(reset.allowed, true);
assert.equal(reset.remaining, 1);

const duplicateIdentifiers = await firstInstance.check({
  group: 'duplicate',
  identifiers: ['same', ' same ', 'same'],
  limit: 3,
  windowMs: 1000,
  now: 2001
});
assert.equal(duplicateIdentifiers.allowed, true);
assert.equal(redis.lastKeys.length, 1);

const bypass = await firstInstance.check({
  group: 'empty',
  identifiers: [],
  limit: 5,
  windowMs: 1000,
  now: 3000
});
assert.equal(bypass.allowed, true);
assert.equal(bypass.remaining, 5);

console.log('Shared Redis rate-limit semantics passed.');
