export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimitInput extends RateLimitPolicy {
  group: string;
  identifiers: string[];
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
  limitedIdentifier?: string;
}

interface Counter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();

function counterKey(group: string, identifier: string): string {
  return `${group}:${identifier}`;
}

function activeCounter(key: string, now: number, windowMs: number): Counter {
  const existing = counters.get(key);

  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + windowMs };
    counters.set(key, fresh);
    return fresh;
  }

  return existing;
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const now = input.now ?? Date.now();
  const identifiers = [...new Set(input.identifiers.map((value) => value.trim()).filter(Boolean))];

  if (identifiers.length === 0 || input.limit <= 0 || input.windowMs <= 0) {
    return {
      allowed: true,
      remaining: Math.max(0, input.limit),
      retryAfterSeconds: 0,
      resetAt: new Date(now)
    };
  }

  const entries = identifiers.map((identifier) => {
    const counter = activeCounter(counterKey(input.group, identifier), now, input.windowMs);
    return { identifier, counter };
  });

  const limited = entries.find(({ counter }) => counter.count >= input.limit);
  if (limited) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((limited.counter.resetAt - now) / 1000)),
      resetAt: new Date(limited.counter.resetAt),
      limitedIdentifier: limited.identifier
    };
  }

  for (const { counter } of entries) {
    counter.count += 1;
  }

  const highestCount = Math.max(...entries.map(({ counter }) => counter.count));
  const earliestReset = Math.min(...entries.map(({ counter }) => counter.resetAt));

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - highestCount),
    retryAfterSeconds: 0,
    resetAt: new Date(earliestReset)
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return {
    error: 'Too many requests',
    retryAfterSeconds: result.retryAfterSeconds,
    resetAt: result.resetAt.toISOString()
  };
}
