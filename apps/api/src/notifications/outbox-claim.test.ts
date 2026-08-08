import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import { claimEnabledNotificationDeliveries } from './outbox-claim.js';

const userId = randomUUID();
const notificationId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values({
    id: userId,
    email: `notification-claim-${userId}@example.test`,
    display_name: 'Notification Claim User',
    status: 'active',
    email_verified_at: now,
    created_at: now,
    updated_at: now
  }).execute();

  await db.insertInto('notifications').values({
    id: notificationId,
    user_id: userId,
    event_type: 'order.created',
    event_family: 'orders',
    title: 'Order created',
    body: 'Your order was created.',
    dedupe_key: `claim-test:${notificationId}`,
    metadata: {},
    created_at: now
  }).execute();

  await db.insertInto('notification_deliveries').values([
    {
      notification_id: notificationId,
      channel: 'email',
      destination: `notification-claim-${userId}@example.test`,
      status: 'pending',
      attempt_count: 0,
      next_attempt_at: now,
      created_at: now,
      updated_at: now
    },
    {
      notification_id: notificationId,
      channel: 'push',
      destination: `push-${userId}`,
      status: 'pending',
      attempt_count: 0,
      next_attempt_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  const claimed = await claimEnabledNotificationDeliveries({
    channels: ['email'],
    batchSize: 10,
    lockTimeoutMs: 60_000,
    now: new Date(now.getTime() + 1)
  });

  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]?.channel, 'email');
  assert.equal(claimed[0]?.attempt_count, 1);

  const rows = await db.selectFrom('notification_deliveries')
    .select(['channel', 'status', 'attempt_count'])
    .where('notification_id', '=', notificationId)
    .orderBy('channel', 'asc')
    .execute();

  assert.deepEqual(rows, [
    { channel: 'email', status: 'processing', attempt_count: 1 },
    { channel: 'push', status: 'pending', attempt_count: 0 }
  ]);

  const none = await claimEnabledNotificationDeliveries({
    channels: [],
    batchSize: 10,
    lockTimeoutMs: 60_000,
    now: new Date(now.getTime() + 2)
  });
  assert.deepEqual(none, []);
} finally {
  await db.deleteFrom('users').where('id', '=', userId).execute();
  await closeDb();
}
