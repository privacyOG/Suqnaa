import { createHash } from 'node:crypto';
import type { RateLimitResult } from './rate-limit.js';

export interface RedisEvalClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export interface SharedRateLimitInput {
  group: string;
  identifiers: string[];
  limit: number;
  windowMs: number;
  now?: number;
}

export interface RedisRateLimiterOptions {
  client: RedisEvalClient;
  keyPrefix?: string;
}

const rateLimitScript = `
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

for i, key in ipairs(KEYS) do
  local current = tonumber(redis.call('GET', key) or '0')
  if current >= limit then
    local ttl = redis.call('PTTL', key)
    if ttl < 1 then ttl = 1 end
    return {0, 0, ttl, i}
  end
end

local highest = 0
local earliest = window
for _, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('PEXPIRE', key, window)
  end
  local ttl = redis.call('PTTL', key)
  if ttl < 1 then
    redis.call('PEXPIRE', key, window)
    ttl = window
  end
  if count > highest then highest = count end
  if ttl < earliest then earliest = ttl end
end

return {1, math.max(0, limit - highest), earliest, 0}
`;

function normalizeIdentifiers(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hashIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier).digest('hex');
}

function parseInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  throw new Error(`Redis rate-limit result has invalid ${label}`);
}

function parseResult(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length < 4) {
    throw new Error('Redis rate-limit result has invalid shape');
  }

  return [
    parseInteger(value[0], 'allowed flag'),
    parseInteger(value[1], 'remaining count'),
    parseInteger(value[2], 'ttl'),
    parseInteger(value[3], 'limited index')
  ];
}

export class RedisRateLimiter {
  private readonly client: RedisEvalClient;
  private readonly keyPrefix: string;

  constructor(options: RedisRateLimiterOptions) {
    this.client = options.client;
    this.keyPrefix = (options.keyPrefix ?? 'suqnaa:rate-limit').replace(/:+$/, '');
  }

  async check(input: SharedRateLimitInput): Promise<RateLimitResult> {
    const now = input.now ?? Date.now();
    const identifiers = normalizeIdentifiers(input.identifiers);

    if (identifiers.length === 0 || input.limit <= 0 || input.windowMs <= 0) {
      return {
        allowed: true,
        remaining: Math.max(0, input.limit),
        retryAfterSeconds: 0,
        resetAt: new Date(now)
      };
    }

    const keys = identifiers.map(
      (identifier) => `${this.keyPrefix}:${input.group}:${hashIdentifier(identifier)}`
    );
    const result = parseResult(
      await this.client.eval(rateLimitScript, keys, [String(input.limit), String(input.windowMs)])
    );
    const [allowedFlag, remaining, ttlMs, limitedIndex] = result;
    const safeTtlMs = Math.max(1, ttlMs);
    const limitedIdentifier = limitedIndex > 0 ? identifiers[limitedIndex - 1] : undefined;

    return {
      allowed: allowedFlag === 1,
      remaining: Math.max(0, remaining),
      retryAfterSeconds: allowedFlag === 1 ? 0 : Math.max(1, Math.ceil(safeTtlMs / 1000)),
      resetAt: new Date(now + safeTtlMs),
      ...(limitedIdentifier ? { limitedIdentifier } : {})
    };
  }
}

export const redisRateLimitLuaScript = rateLimitScript;
