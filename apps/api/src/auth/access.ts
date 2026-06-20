import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export interface AccessClaims {
  sub: string;
  email?: string | null;
  status?: string;
  iat: number;
  exp: number;
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(value).digest('base64url');
}

export function createAccessToken(input: { userId: string; email?: string | null; status?: string; ttlSeconds?: number }): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessClaims = {
    sub: input.userId,
    email: input.email ?? null,
    status: input.status,
    iat: now,
    exp: now + (input.ttlSeconds ?? 900)
  };

  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson(claims);
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

export function verifyAccessToken(token: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const body = `${header}.${payload}`;
  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessClaims;
  if (!claims.sub || claims.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return claims;
}
