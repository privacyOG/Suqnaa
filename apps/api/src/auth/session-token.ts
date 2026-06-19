import { createHash, randomBytes } from 'node:crypto';

export function newSessionToken(): string {
  return randomBytes(48).toString('base64url');
}

export function sessionTokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function daysFromNow(days: number): Date {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
