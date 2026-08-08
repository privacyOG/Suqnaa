import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import { registerPushTarget } from './service.js';

const senderId = randomUUID();
const recipientId = randomUUID();
const conversationId = randomUUID();
const messageId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values([
    {
      id: senderId,
      email: `notification-muted-sender-${senderId}@example.test`,
      display_name: 'Muted Notification Sender',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: recipientId,
      email: `notification-muted-recipient-${recipientId}@example.test`,
      display_name: 'Muted Notification Recipient',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  await registerPushTarget({
    userId: recipientId,
    provider: 'approved-gateway',
    platform: 'android',
    destination: `muted-push-${recipientId}`
  });

  await db.insertInto('conversations').values({
    id: conversationId,
    buyer_id: senderId,
    seller_id: recipientId,
    participant_key: [senderId, recipientId].sort().join(':'),
    created_at: now,
    updated_at: now
  }).execute();

  await db.insertInto('conversation_mutes').values({
    user_id: recipientId,
    conversation_id: conversationId,
    created_at: now,
    updated_at: now
  }).execute();

  const body = 'Muted conversations remain visible in-app';
  await db.insertInto('messages').values({
    id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    body,
    content_fingerprint: createHash('sha256').update(body.toLowerCase()).digest('hex'),
    status: 'queued',
    created_at: now,
    updated_at: now
  }).execute();

  const notification = await db.selectFrom('notifications')
    .select(['id', 'event_type', 'metadata'])
    .where('user_id', '=', recipientId)
    .where('entity_id', '=', messageId)
    .executeTakeFirstOrThrow();

  assert.equal(notification.event_type, 'message.received');
  assert.equal((notification.metadata as Record<string, unknown>).muted, true);

  const deliveries = await db.selectFrom('notification_deliveries')
    .select(['id'])
    .where('notification_id', '=', notification.id)
    .execute();
  assert.equal(deliveries.length, 0);
} finally {
  await db.deleteFrom('users').where('id', 'in', [senderId, recipientId]).execute();
  await closeDb();
}
