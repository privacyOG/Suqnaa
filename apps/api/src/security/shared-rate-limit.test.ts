import assert from 'node:assert/strict';
import { checkSharedRateLimit, RateLimitUnavailableError, resetSharedRateLimiterForTests } from './shared-rate-limit.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalRedisUrl = process.env.REDIS_URL;

try {
  process.env.NODE_ENV = 'development';
  delete process.env.REDIS_URL;
  resetSharedRateLimiterForTests();

  const local = await checkSharedRateLimit({
    group: 'test.local',
    identifiers: ['user:1'],
    limit: 1,
    windowMs: 1_000,
    now: 1_000
  });
  assert.equal(local.allowed, true);

  process.env.NODE_ENV = 'production';
  delete process.env.REDIS_URL;
  resetSharedRateLimiterForTests();

  await assert.rejects(
    () => checkSharedRateLimit({
      group: 'test.production',
      identifiers: ['user:1'],
      limit: 1,
      windowMs: 1_000
    }),
    (error: unknown) => error instanceof RateLimitUnavailableError
      && /REDIS_URL is required/.test(error.message)
  );

  process.env.REDIS_URL = 'http://localhost:6379';
  resetSharedRateLimiterForTests();

  await assert.rejects(
    () => checkSharedRateLimit({
      group: 'test.production.invalid-url',
      identifiers: ['user:1'],
      limit: 1,
      windowMs: 1_000
    }),
    (error: unknown) => error instanceof RateLimitUnavailableError
      && /redis:\/\/ or rediss:\/\//.test(error.message)
  );
} finally {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;

  resetSharedRateLimiterForTests();
}

console.log('shared rate limit runtime tests passed');
