import { createHmac, randomBytes } from 'node:crypto';

const resetTokenPattern = /^[A-Za-z0-9_-]{40,120}$/;

export function newPasswordResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function normalizePasswordResetToken(value: string): string {
  const normalized = value.trim();
  if (!resetTokenPattern.test(normalized)) {
    throw new Error('Invalid password reset token');
  }
  return normalized;
}

export function passwordResetTokenHash(pepper: string, token: string): string {
  return createHmac('sha256', pepper)
    .update(`password-reset:${normalizePasswordResetToken(token)}`)
    .digest('hex');
}

export function passwordResetTargetFingerprint(pepper: string, email: string): string {
  return createHmac('sha256', pepper)
    .update(`password-reset-target:${email.trim().toLowerCase()}`)
    .digest('hex');
}
