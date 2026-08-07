import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import type { PasswordResetDeliveryInput, PasswordResetDeliveryProvider } from './delivery.js';
import { requestPhonePasswordReset } from './phone-recovery.js';
import { resetPasswordWithToken } from './service.js';

const pepper = 'phone-recovery-test-pepper-at-least-32-characters';
const userId = randomUUID();
const baseTime = new Date();

class CaptureProvider implements PasswordResetDeliveryProvider {
  deliveries: PasswordResetDeliveryInput[] = [];
  async deliver(input: PasswordResetDeliveryInput): Promise<void> {
    this.deliveries.push(input);
  }
}

try {
  await db.insertInto('users').values({
    id: userId,
    email: null,
    phone_e164: '+61405555123',
    display_name: 'Phone Recovery Test',
    password_hash: await hashPassword('Original-phone-password-123'),
    status: 'active',
    email_verified_at: null,
    phone_verified_at: baseTime,
    created_at: baseTime,
    updated_at: baseTime
  }).execute();

  const provider = new CaptureProvider();
  await requestPhonePasswordReset({
    phone: '0061 (405) 555-123',
    pepper,
    provider,
    now: baseTime
  });

  assert.equal(provider.deliveries.length, 1);
  assert.equal(provider.deliveries[0]!.channel, 'phone');
  assert.equal(provider.deliveries[0]!.destination, '+61405555123');
  const token = provider.deliveries[0]!.token;

  const stored = await db.selectFrom('password_reset_tokens')
    .select(['token_hash'])
    .where('user_id', '=', userId)
    .executeTakeFirstOrThrow();
  assert.equal(stored.token_hash.length, 64);
  assert.notEqual(stored.token_hash, token);

  await requestPhonePasswordReset({
    phone: '+61 405 555 123',
    pepper,
    provider,
    now: new Date(baseTime.getTime() + 30 * 1000)
  });
  assert.equal(provider.deliveries.length, 1);

  const reset = await resetPasswordWithToken({
    token,
    newPassword: 'Replacement-phone-password-456',
    pepper,
    now: new Date(baseTime.getTime() + 40 * 1000)
  });
  assert.equal(reset.outcome, 'reset');

  const user = await db.selectFrom('users')
    .select(['password_hash'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  assert.equal(await verifyPassword(user.password_hash, 'Replacement-phone-password-456'), true);

  const unknownProvider = new CaptureProvider();
  await requestPhonePasswordReset({
    phone: '+61409999999',
    pepper,
    provider: unknownProvider,
    now: baseTime
  });
  assert.equal(unknownProvider.deliveries.length, 0);

  console.log('Phone password recovery tests passed.');
} finally {
  await db.deleteFrom('users').where('id', '=', userId).execute();
  await closeDb();
}
