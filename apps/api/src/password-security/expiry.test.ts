import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import { hashPassword } from '../security/password.js';
import type {
  PasswordResetDeliveryInput,
  PasswordResetDeliveryProvider
} from './delivery.js';
import {
  requestPasswordReset,
  resetPasswordWithToken
} from './service.js';

const pepper = 'password-reset-expiry-test-pepper-32-characters-minimum';
const issuedAt = new Date(Date.now() - 30 * 60 * 1000);
const userId = randomUUID();

class CaptureProvider implements PasswordResetDeliveryProvider {
  delivery?: PasswordResetDeliveryInput;

  async deliver(input: PasswordResetDeliveryInput): Promise<void> {
    this.delivery = input;
  }
}

try {
  const email = `reset-expiry-${randomUUID()}@example.test`;
  await db.insertInto('users').values({
    id: userId,
    email,
    phone_e164: null,
    display_name: 'Reset Expiry Test',
    password_hash: await hashPassword('Original-password-123'),
    status: 'active',
    email_verified_at: issuedAt,
    phone_verified_at: null,
    created_at: issuedAt,
    updated_at: issuedAt
  }).execute();

  const provider = new CaptureProvider();
  await requestPasswordReset({
    email,
    pepper,
    provider,
    now: issuedAt
  });

  assert.ok(provider.delivery);
  assert.equal(
    provider.delivery!.expiresAt.getTime(),
    issuedAt.getTime() + 20 * 60 * 1000
  );

  const expired = await resetPasswordWithToken({
    token: provider.delivery!.token,
    newPassword: 'Replacement-password-456',
    pepper,
    now: new Date(issuedAt.getTime() + 20 * 60 * 1000 + 1)
  });

  assert.equal(expired.outcome, 'invalid_token');
  console.log('Password reset expiry tests passed.');
} finally {
  await db.deleteFrom('users').where('id', '=', userId).execute();
  await closeDb();
}
