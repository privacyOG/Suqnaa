import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';

const userId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values({
    id: userId,
    email: `notification-security-${userId}@example.test`,
    display_name: 'Security Notification User',
    status: 'active',
    email_verified_at: now,
    created_at: now,
    updated_at: now
  }).execute();

  const audit = await db.insertInto('audit_logs').values({
    actor_user_id: userId,
    action: 'account.password.changed',
    entity_type: 'user',
    entity_id: userId,
    metadata: { revokedSessions: 2 },
    created_at: now
  }).returning(['id']).executeTakeFirstOrThrow();

  const notification = await db.selectFrom('notifications')
    .select(['id', 'event_type', 'event_family', 'entity_id', 'metadata'])
    .where('user_id', '=', userId)
    .where('dedupe_key', '=', `account-security:${audit.id}`)
    .executeTakeFirstOrThrow();

  assert.equal(notification.event_type, 'account.security');
  assert.equal(notification.event_family, 'account_security');
  assert.equal(notification.entity_id, audit.id);
  assert.equal((notification.metadata as Record<string, unknown>).action, 'account.password.changed');

  const deliveries = await db.selectFrom('notification_deliveries')
    .select(['channel', 'status'])
    .where('notification_id', '=', notification.id)
    .execute();
  assert.deepEqual(deliveries.map((row) => row.channel), ['email']);
  assert.equal(deliveries[0]?.status, 'pending');

  await db.insertInto('audit_logs').values({
    actor_user_id: userId,
    action: 'account.profile.updated',
    entity_type: 'user',
    entity_id: userId,
    metadata: {},
    created_at: new Date(now.getTime() + 1)
  }).execute();

  const securityNotifications = await db.selectFrom('notifications')
    .select(['id'])
    .where('user_id', '=', userId)
    .where('event_family', '=', 'account_security')
    .execute();
  assert.equal(securityNotifications.length, 1);
} finally {
  await db.deleteFrom('users').where('id', '=', userId).execute();
  await closeDb();
}
