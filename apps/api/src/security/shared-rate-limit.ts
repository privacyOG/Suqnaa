import { checkRateLimit, type RateLimitInput, type RateLimitResult } from './rate-limit.js';
import { RedisUrlEvalClient } from './redis-eval-client.js';
import { RedisRateLimiter } from './redis-rate-limit.js';

export class RateLimitUnavailableError extends Error {
  constructor(message = 'Shared rate limiting is unavailable') {
    super(message);
    this.name = 'RateLimitUnavailableError';
  }
}

let configuredUrl: string | undefined;
let configuredLimiter: RedisRateLimiter | undefined;

function redisUrl(): string | undefined {
  const value = process.env.REDIS_URL?.trim();
  return value || undefined;
}

function productionMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

function sharedLimiter(url: string): RedisRateLimiter {
  if (!configuredLimiter || configuredUrl !== url) {
    configuredUrl = url;
    configuredLimiter = new RedisRateLimiter({
      client: new RedisUrlEvalClient({ url })
    });
  }
  return configuredLimiter;
}

export async function checkSharedRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const url = redisUrl();

  if (!url) {
    if (productionMode()) {
      throw new RateLimitUnavailableError('REDIS_URL is required for production rate limiting');
    }
    return checkRateLimit(input);
  }

  try {
    return await sharedLimiter(url).check(input);
  } catch (error) {
    if (productionMode()) {
      throw new RateLimitUnavailableError(
        error instanceof Error
          ? `Shared rate limiting failed: ${error.message}`
          : 'Shared rate limiting failed'
      );
    }
    return checkRateLimit(input);
  }
}

export function rateLimitUnavailableResponse() {
  return {
    error: 'Security service temporarily unavailable'
  };
}

export function resetSharedRateLimiterForTests(): void {
  configuredUrl = undefined;
  configuredLimiter = undefined;
}
