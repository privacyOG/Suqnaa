import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import type {
  PasswordResetDeliveryInput,
  PasswordResetDeliveryProvider
} from './delivery.js';
import {
  changePassword,
  listSecuritySessions,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeAllSecuritySessions,
  revokeSecuritySession
} from './service.js';

const pepper = 'password-reset-test-pepper-at-least-32-characters';
const baseTime = new Date(Date.now() - 10 * 60 * 1000);
const createdUsers: string[] = [];

class CaptureProvider implements PasswordResetDeliveryProvider {
  deliveries: PasswordResetDeliveryInput[] = [];
  async deliver(input: PasswordResetDeliveryInput): Promise<void> {
    this.deliveries.push(input);
  }
}

class FailingProvider implements PasswordResetDeliveryProvider {
  async deliver(): Promise<void> {
    throw new Error('delivery unavailable');
  }
}

async function createUser(email: string, password = 'Original-password-123') {
  const id = randomUUID();
  createdUsers.push(id);
  await db.insertInto('users').values({
    id,
    email,
    phone_e164: null,
    display_name: 'Password Security Test',
    password_hash: await hashPassword(password),
    status: 'active',
    email_verified_at: baseTime,
    phone_verified_at: null,
    created_at: baseTime,
    updated_at: baseTime
  }).execute();
  return { id, password };
}

async function createSession(userId: string, createdAt: Date) {
  const id = randomUUID();
  await db.insertInto('refresh_sessions').values({
    id,
    user_id: userId,
    token_hash: `test-${randomUUID()}`,
    user_agent: 'Password security test client',
    ip_address: '127.0.0.1',
    expires_at: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    revoked_at: null,
    created_at: createdAt
  }).execute();
  return id;
}

try {
  const unknownBefore = await db.selectFrom('password_reset_tokens')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  await requestPasswordReset({
    email: `unknown-${randomUUID()}@example.test`,
    pepper,
    provider: new CaptureProvider(),
    now: baseTime
  });
  const unknownAfter = await db.selectFrom('password_reset_tokens')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  assert.equal(Number(unknownAfter.count), Number(unknownBefore.count));

  const user = await createUser(`reset-${randomUUID()}@example.test`);
  await createSession(user.id, baseTime);
  await createSession(user.id, new Date(baseTime.getTime() + 1000));
  const provider = new CaptureProvider();

  await requestPasswordReset({
    email: ` RESET-${user.id}@example.invalid`,
    pepper,
    provider,
    now: baseTime
  });
  assert.equal(provider.deliveries.length, 0);

  const actualEmail = (await db.selectFrom('users')
    .select(['email'])
    .where('id', '=', user.id)
    .executeTakeFirstOrThrow()).email as string;

  await requestPasswordReset({
    email: actualEmail.toUpperCase(),
    ipAddress: '127.0.0.1',
    pepper,
    provider,
    now: baseTime
  });
  assert.equal(provider.deliveries.length, 1);
  const firstToken = provider.deliveries[0]!.token;

  const stored = await db.selectFrom('password_reset_tokens')
    .select(['id', 'token_hash', 'invalidated_at'])
    .where('user_id', '=', user.id)
    .orderBy('created_at', 'asc')
    .execute();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]!.token_hash.length, 64);
  assert.notEqual(stored[0]!.token_hash, firstToken);

  await requestPasswordReset({
    email: actualEmail,
    pepper,
    provider,
    now: new Date(baseTime.getTime() + 30 * 1000)
  });
  assert.equal(provider.deliveries.length, 1);

  const secondRequestTime = new Date(baseTime.getTime() + 61 * 1000);
  await requestPasswordReset({
    email: actualEmail,
    pepper,
    provider,
    now: secondRequestTime
  });
  assert.equal(provider.deliveries.length, 2);
  const firstRecord = await db.selectFrom('password_reset_tokens')
    .select(['invalidated_at'])
    .where('id', '=', stored[0]!.id)
    .executeTakeFirstOrThrow();
  assert.ok(firstRecord.invalidated_at);

  const stale = await resetPasswordWithToken({
    token: firstToken,
    newPassword: 'Replacement-password-456',
    pepper,
    now: new Date(secondRequestTime.getTime() + 1000)
  });
  assert.equal(stale.outcome, 'invalid_token');

  const secondToken = provider.deliveries[1]!.token;
  const reset = await resetPasswordWithToken({
    token: secondToken,
    newPassword: 'Replacement-password-456',
    pepper,
    ipAddress: '127.0.0.1',
    now: new Date(secondRequestTime.getTime() + 2000)
  });
  assert.equal(reset.outcome, 'reset');
  if (reset.outcome === 'reset') {
    assert.equal(reset.revokedSessions, 2);
  }

  const updatedUser = await db.selectFrom('users')
    .select(['password_hash'])
    .where('id', '=', user.id)
    .executeTakeFirstOrThrow();
  assert.equal(await verifyPassword(updatedUser.password_hash, user.password), false);
  assert.equal(await verifyPassword(updatedUser.password_hash, 'Replacement-password-456'), true);

  const activeAfterReset = await listSecuritySessions(user.id);
  assert.equal(activeAfterReset.length, 0);
  const replay = await resetPasswordWithToken({
    token: secondToken,
    newPassword: 'Another-password-789',
    pepper,
    now: new Date(secondRequestTime.getTime() + 3000)
  });
  assert.equal(replay.outcome, 'invalid_token');

  const changeUser = await createUser(`change-${randomUUID()}@example.test`);
  await createSession(changeUser.id, baseTime);
  await createSession(changeUser.id, new Date(baseTime.getTime() + 1000));

  assert.equal((await changePassword({
    userId: changeUser.id,
    currentPassword: 'wrong-password',
    newPassword: 'Changed-password-456'
  })).outcome, 'invalid_current_password');

  assert.equal((await changePassword({
    userId: changeUser.id,
    currentPassword: changeUser.password,
    newPassword: changeUser.password
  })).outcome, 'same_password');

  const changed = await changePassword({
    userId: changeUser.id,
    currentPassword: changeUser.password,
    newPassword: 'Changed-password-456',
    ipAddress: '127.0.0.1'
  });
  assert.equal(changed.outcome, 'changed');
  if (changed.outcome === 'changed') {
    assert.equal(changed.revokedSessions, 2);
  }
  assert.equal((await listSecuritySessions(changeUser.id)).length, 0);

  const sessionUser = await createUser(`sessions-${randomUUID()}@example.test`);
  const firstSession = await createSession(sessionUser.id, baseTime);
  const secondSession = await createSession(sessionUser.id, new Date(baseTime.getTime() + 1000));
  assert.equal((await listSecuritySessions(sessionUser.id)).length, 2);
  assert.equal(await revokeSecuritySession({
    userId: sessionUser.id,
    sessionId: firstSession,
    ipAddress: '127.0.0.1'
  }), true);
  assert.equal(await revokeSecuritySession({
    userId: sessionUser.id,
    sessionId: firstSession
  }), false);
  const remaining = await listSecuritySessions(sessionUser.id);
  assert.deepEqual(remaining.map((session) => session.id), [secondSession]);
  assert.equal(await revokeAllSecuritySessions({ userId: sessionUser.id }), 1);
  assert.equal((await listSecuritySessions(sessionUser.id)).length, 0);

  const samePasswordUser = await createUser(`same-${randomUUID()}@example.test`);
  const sameProvider = new CaptureProvider();
  await requestPasswordReset({
    email: (await db.selectFrom('users').select(['email']).where('id', '=', samePasswordUser.id).executeTakeFirstOrThrow()).email,
    pepper,
    provider: sameProvider,
    now: baseTime
  });
  const sameResult = await resetPasswordWithToken({
    token: sameProvider.deliveries[0]!.token,
    newPassword: samePasswordUser.password,
    pepper,
    now: new Date(baseTime.getTime() + 1000)
  });
  assert.equal(sameResult.outcome, 'same_password');

  const failedUser = await createUser(`failure-${randomUUID()}@example.test`);
  await requestPasswordReset({
    email: (await db.selectFrom('users').select(['email']).where('id', '=', failedUser.id).executeTakeFirstOrThrow()).email,
    pepper,
    provider: new FailingProvider(),
    now: baseTime
  });
  const failedRecord = await db.selectFrom('password_reset_tokens')
    .select(['invalidated_at'])
    .where('user_id', '=', failedUser.id)
    .executeTakeFirstOrThrow();
  assert.ok(failedRecord.invalidated_at);

  const audits = await db.selectFrom('audit_logs')
    .select(['action'])
    .where('actor_user_id', '=', user.id)
    .execute();
  assert.ok(audits.some((entry) => entry.action === 'account.password_reset.requested'));
  assert.ok(audits.some((entry) => entry.action === 'account.password_reset.completed'));

  console.log('Password security service tests passed.');
} finally {
  for (const userId of createdUsers) {
    await db.deleteFrom('users').where('id', '=', userId).execute();
  }
  await closeDb();
}
