export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimitInput extends RateLimitPolicy {
  group: string;
  identifiers: string[];
  now?: number;
  store?: RateLimitStore;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
  limitedIdentifier?: string;
}

export interface RateLimitCounter {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  get(key: string): RateLimitCounter | undefined;
  set(key: string, value: RateLimitCounter): void;
  delete(key: string): void;
  entries(): IterableIterator<[string, RateLimitCounter]>;
}

export interface InMemoryRateLimitStoreOptions {
  maxEntries?: number;
}

const defaultMaxEntries = 10_000;

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, RateLimitCounter>();
  readonly maxEntries: number;

  constructor(options: InMemoryRateLimitStoreOptions = {}) {
    const configuredMaxEntries = options.maxEntries ?? defaultMaxEntries;

    if (!Number.isInteger(configuredMaxEntries) || configuredMaxEntries <= 0) {
      throw new Error('maxEntries must be a positive integer');
    }

    this.maxEntries = configuredMaxEntries;
  }

  get size(): number {
    return this.counters.size;
  }

  get(key: string): RateLimitCounter | undefined {
    return this.counters.get(key);
  }

  set(key: string, value: RateLimitCounter): void {
    if (!this.counters.has(key) && this.counters.size >= this.maxEntries) {
      this.evictEarliestReset();
    }

    this.counters.set(key, value);
  }

  delete(key: string): void {
    this.counters.delete(key);
  }

  entries(): IterableIterator<[string, RateLimitCounter]> {
    return this.counters.entries();
  }

  private evictEarliestReset(): void {
    let selectedKey: string | undefined;
    let earliestResetAt = Number.POSITIVE_INFINITY;

    for (const [key, counter] of this.counters.entries()) {
      if (counter.resetAt < earliestResetAt) {
        earliestResetAt = counter.resetAt;
        selectedKey = key;
      }
    }

    if (selectedKey) {
      this.counters.delete(selectedKey);
    }
  }
}

export const defaultRateLimitStore = new InMemoryRateLimitStore();

let operationsSinceCleanup = 0;
const cleanupInterval = 256;

function counterKey(group: string, identifier: string): string {
  return `${group}:${identifier}`;
}

function activeCounter(
  store: RateLimitStore,
  key: string,
  now: number,
  windowMs: number
): RateLimitCounter {
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + windowMs };
    store.set(key, fresh);
    return fresh;
  }

  return existing;
}

export function cleanupExpiredRateLimits(
  store: RateLimitStore = defaultRateLimitStore,
  now = Date.now()
): number {
  let removed = 0;

  for (const [key, counter] of store.entries()) {
    if (counter.resetAt <= now) {
      store.delete(key);
      removed += 1;
    }
  }

  return removed;
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const now = input.now ?? Date.now();
  const store = input.store ?? defaultRateLimitStore;
  const identifiers = [...new Set(input.identifiers.map((value) => value.trim()).filter(Boolean))];

  operationsSinceCleanup += 1;
  if (operationsSinceCleanup >= cleanupInterval) {
    cleanupExpiredRateLimits(store, now);
    operationsSinceCleanup = 0;
  }

  if (identifiers.length === 0 || input.limit <= 0 || input.windowMs <= 0) {
    return {
      allowed: true,
      remaining: Math.max(0, input.limit),
      retryAfterSeconds: 0,
      resetAt: new Date(now)
    };
  }

  const entries = identifiers.map((identifier) => {
    const counter = activeCounter(store, counterKey(input.group, identifier), now, input.windowMs);
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
