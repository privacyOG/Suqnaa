import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { VerificationChannel } from './provider.js';

const verificationCodePattern = /^\d{6}$/;

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function normalizeVerificationCode(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '');
  if (!verificationCodePattern.test(normalized)) {
    throw new Error('Verification code must contain exactly six digits');
  }
  return normalized;
}

export function contactFingerprint(
  pepper: string,
  channel: VerificationChannel,
  destination: string
): string {
  return createHmac('sha256', pepper)
    .update(`contact:${channel}:${destination.trim().toLowerCase()}`)
    .digest('hex');
}

export function verificationCodeHash(input: {
  pepper: string;
  verificationId: string;
  userId: string;
  channel: VerificationChannel;
  code: string;
}): string {
  return createHmac('sha256', input.pepper)
    .update(`code:${input.verificationId}:${input.userId}:${input.channel}:${input.code}`)
    .digest('hex');
}

export function verificationCodeMatches(expectedHash: string, actualHash: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
