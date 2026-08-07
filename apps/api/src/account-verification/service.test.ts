import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  confirmContactVerification,
  loadVerificationState,
  requestContactVerification,
  VerificationDeliveryError
} from './service.js';
import type {
  VerificationDeliveryInput,
  VerificationDeliveryProvider
} from './provider.js';

const pepper = 'contact-verification-test-pepper-32-characters-minimum';
const baseTime = new Date(Date.now() - 30 * 60 * 1000);
const createdUsers: string[] = [];

class CaptureProvider implements VerificationDeliveryProvider {
  deliveries: VerificationDeliveryInput[] = [];

  async deliver(input: VerificationDeliveryInput): Promise<void> {
    this.deliveries.push(input);
  }
}

class FailingProvider implements VerificationDeliveryProvider {
  async deliver(): Promise<void> {
    throw new Error('delivery unavailable');
  }
}

async function createUser(input: { email?: string; phone?: string }) {
  const id = randomUUID();
  createdUsers.push(id);
  await db.insertInto('users').values({
    id,
    email: input.email ?? null,
    phone_e164: input.phone ?? null,
    display_name: 'Verification Test User',
    password_hash: null,
    status: 'pending',
    email_verified_at: null,
    phone_verified_at: null,
    created_at: baseTime,
    updated_at: baseTime
  }).execute();
  return id;
}

try {
  const emailProvider = new CaptureProvider();
  const emailUserId = await createUser({
    email: `verification-${randomUUID()}@example.test`
  });

  const initialState = await loadVerificationState(emailUserId);
  assert.equal(initialState?.status, 'pending');
  assert.equal(initialState?.channels[0]?.channel, 'email');
  assert.equal(initialState?.channels[0]?.available, true);
  assert.equal(initialState?.channels[0]?.verifiedAt, null);
  assert.equal(initialState?.channels[1]?.available, false);

  const firstRequest = await requestContactVerification({
    userId: emailUserId,
    channel: 'email',
    pepper,
    provider: emailProvider,
    ipAddress: '127.0.0.1',
    now: baseTime
  });
  assert.equal(firstRequest.outcome, 'sent');
  assert.equal(emailProvider.deliveries.length, 1);
  assert.match(emailProvider.deliveries[0]!.code, /^\d{6}$/);

  const plaintextCodeRows = await db.selectFrom('account_contact_verifications')
    .select(['code_hash', 'contact_fingerprint'])
    .where('user_id', '=', emailUserId)
    .execute();
  assert.equal(plaintextCodeRows.length, 1);
  assert.equal(plaintextCodeRows[0]!.code_hash.length, 64);
  assert.equal(plaintextCodeRows[0]!.contact_fingerprint.length, 64);
  assert.notEqual(plaintextCodeRows[0]!.code_hash, emailProvider.deliveries[0]!.code);

  const cooldown = await requestContactVerification({
    userId: emailUserId,
    channel: 'email',
    pepper,
    provider: emailProvider,
    now: new Date(baseTime.getTime() + 30 * 1000)
  });
  assert.equal(cooldown.outcome, 'rate_limited');

  const malformed = await confirmContactVerification({
    userId: emailUserId,
    channel: 'email',
    code: 'bad-code',
    pepper,
    now: new Date(baseTime.getTime() + 35 * 1000)
  });
  assert.deepEqual(malformed, { outcome: 'invalid_code', attemptsRemaining: 4 });

  const firstCode = emailProvider.deliveries[0]!.code;
  const secondRequestTime = new Date(baseTime.getTime() + 61 * 1000);
  const secondRequest = await requestContactVerification({
    userId: emailUserId,
    channel: 'email',
    pepper,
    provider: emailProvider,
    now: secondRequestTime
  });
  assert.equal(secondRequest.outcome, 'sent');
  assert.equal(emailProvider.deliveries.length, 2);

  const oldCodeResult = await confirmContactVerification({
    userId: emailUserId,
    channel: 'email',
    code: firstCode,
    pepper,
    now: new Date(secondRequestTime.getTime() + 1000)
  });
  assert.deepEqual(oldCodeResult, { outcome: 'invalid_code', attemptsRemaining: 4 });

  const latestCode = emailProvider.deliveries[1]!.code;
  const verified = await confirmContactVerification({
    userId: emailUserId,
    channel: 'email',
    code: latestCode,
    pepper,
    ipAddress: '127.0.0.1',
    now: new Date(secondRequestTime.getTime() + 2000)
  });
  assert.equal(verified.outcome, 'verified');
  if (verified.outcome === 'verified') {
    assert.equal(verified.status, 'active');
  }

  const verifiedUser = await db.selectFrom('users')
    .select(['status', 'email_verified_at'])
    .where('id', '=', emailUserId)
    .executeTakeFirstOrThrow();
  assert.equal(verifiedUser.status, 'active');
  assert.ok(verifiedUser.email_verified_at);

  const idempotentConfirm = await confirmContactVerification({
    userId: emailUserId,
    channel: 'email',
    code: latestCode,
    pepper,
    now: new Date(secondRequestTime.getTime() + 3000)
  });
  assert.equal(idempotentConfirm.outcome, 'already_verified');

  const phoneProvider = new CaptureProvider();
  const phoneUserId = await createUser({ phone: '+61412345678' });
  const phoneRequest = await requestContactVerification({
    userId: phoneUserId,
    channel: 'phone',
    pepper,
    provider: phoneProvider,
    now: baseTime
  });
  assert.equal(phoneRequest.outcome, 'sent');
  assert.equal(phoneProvider.deliveries[0]?.destination, '+61412345678');

  const phoneVerified = await confirmContactVerification({
    userId: phoneUserId,
    channel: 'phone',
    code: phoneProvider.deliveries[0]!.code,
    pepper,
    now: new Date(baseTime.getTime() + 1000)
  });
  assert.equal(phoneVerified.outcome, 'verified');

  const failedDeliveryUserId = await createUser({
    email: `delivery-failure-${randomUUID()}@example.test`
  });
  await assert.rejects(
    requestContactVerification({
      userId: failedDeliveryUserId,
      channel: 'email',
      pepper,
      provider: new FailingProvider(),
      now: baseTime
    }),
    VerificationDeliveryError
  );
  const failedChallenge = await db.selectFrom('account_contact_verifications')
    .select(['invalidated_at'])
    .where('user_id', '=', failedDeliveryUserId)
    .executeTakeFirstOrThrow();
  assert.ok(failedChallenge.invalidated_at);

  const limitedProvider = new CaptureProvider();
  const limitedUserId = await createUser({
    email: `rate-limit-${randomUUID()}@example.test`
  });
  for (let index = 0; index < 5; index += 1) {
    const result = await requestContactVerification({
      userId: limitedUserId,
      channel: 'email',
      pepper,
      provider: limitedProvider,
      now: new Date(baseTime.getTime() + index * 61 * 1000)
    });
    assert.equal(result.outcome, 'sent');
  }
  const hourlyLimited = await requestContactVerification({
    userId: limitedUserId,
    channel: 'email',
    pepper,
    provider: limitedProvider,
    now: new Date(baseTime.getTime() + 5 * 61 * 1000)
  });
  assert.equal(hourlyLimited.outcome, 'rate_limited');

  const exhaustedProvider = new CaptureProvider();
  const exhaustedUserId = await createUser({
    email: `attempt-limit-${randomUUID()}@example.test`
  });
  await requestContactVerification({
    userId: exhaustedUserId,
    channel: 'email',
    pepper,
    provider: exhaustedProvider,
    now: baseTime
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await confirmContactVerification({
      userId: exhaustedUserId,
      channel: 'email',
      code: '999999',
      pepper,
      now: new Date(baseTime.getTime() + attempt * 1000)
    });
    if (attempt < 5) {
      assert.deepEqual(result, {
        outcome: 'invalid_code',
        attemptsRemaining: 5 - attempt
      });
    } else {
      assert.equal(result.outcome, 'attempts_exhausted');
    }
  }

  const auditEntries = await db.selectFrom('audit_logs')
    .select(['action'])
    .where('actor_user_id', '=', emailUserId)
    .where('action', 'in', [
      'account.contact_verification.requested',
      'account.contact_verification.completed'
    ])
    .execute();
  assert.ok(auditEntries.some((entry) => entry.action === 'account.contact_verification.requested'));
  assert.ok(auditEntries.some((entry) => entry.action === 'account.contact_verification.completed'));

  console.log('Account contact verification service tests passed.');
} finally {
  for (const userId of createdUsers) {
    await db.deleteFrom('users').where('id', '=', userId).execute();
  }
  await closeDb();
}
