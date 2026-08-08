import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  claimNotificationDeliveries,
  deliverClaimedNotification,
  getNotificationPreferences,
  listNotifications,
  markNotificationRead,
  registerPushTarget,
  updateNotificationPreference
} from './service.js';

const senderId = randomUUID();
const recipientId = randomUUID();
const conversationId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values([
    {
      id: senderId,
      email: `notification-sender-${senderId}@example.test`,
      display_name: 'Notification Sender',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: recipientId,
      email: `notification-recipient-${recipientId}@example.test`,
      phone_e164: `+614${String(Date.now()).slice(-8)}`,
      display_name: 'Notification Recipient',
      status: 'active',
      email_verified_at: now,
      phone_verified_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  await registerPushTarget({
    userId: recipientId,
    provider: 'approved-gateway',
    platform: 'android',
    destination: `push-${recipientId}`
  });

  const preferences = await getNotificationPreferences(recipientId);
  const messagesPreference = preferences.find((entry) => entry.eventFamily === 'messages');
  assert.equal(messagesPreference?.emailEnabled, true);
  assert.equal(messagesPreference?.smsEnabled, false);
  assert.equal(messagesPreference?.pushEnabled, true);

  await updateNotificationPreference({
    userId: recipientId,
    eventFamily: 'messages',
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: true
  });

  await db.insertInto('conversations').values({
    id: conversationId,
    buyer_id: senderId,
    seller_id: recipientId,
    participant_key: [senderId, recipientId].sort().join(':'),
    created_at: now,
    updated_at: now
  }).execute();

  const messageId = randomUUID();
  const messageBody = 'Durable notification integration test';
  await db.insertInto('messages').values({
    id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    body: messageBody,
    content_fingerprint: createHash('sha256').update(messageBody.toLowerCase()).digest('hex'),
    status: 'queued',
    created_at: now,
    updated_at: now
  }).execute();

  const inbox = await listNotifications({ userId: recipientId, unreadOnly: true });
  assert.equal(inbox.unreadCount, 1);
  assert.equal(inbox.notifications.length, 1);
  assert.equal(inbox.notifications[0]?.eventType, 'message.received');
  assert.equal(inbox.notifications[0]?.entityId, messageId);

  const deliveries = await db.selectFrom('notification_deliveries')
    .select(['channel', 'status'])
    .where('notification_id', '=', inbox.notifications[0]?.id)
    .orderBy('channel', 'asc')
    .execute();
  assert.deepEqual(deliveries.map((row) => row.channel), ['email', 'push']);
  assert.ok(deliveries.every((row) => row.status === 'pending'));

  const read = await markNotificationRead(recipientId, String(inbox.notifications[0]?.id));
  assert.equal(read.unchanged, false);
  const afterRead = await listNotifications({ userId: recipientId, unreadOnly: true });
  assert.equal(afterRead.unreadCount, 0);

  const claimed = await claimNotificationDeliveries({ batchSize: 10, lockTimeoutMs: 60_000 });
  const ours = claimed.filter((delivery) => delivery.notification_id === inbox.notifications[0]?.id);
  assert.equal(ours.length, 2);

  const deliveredIds: string[] = [];
  for (const delivery of ours) {
    const outcome = await deliverClaimedNotification({
      delivery,
      maxAttempts: 3,
      provider: {
        async deliver(payload) {
          deliveredIds.push(payload.deliveryId);
          return { providerMessageId: `provider-${payload.deliveryId}` };
        }
      }
    });
    assert.equal(outcome.outcome, 'sent');
  }
  assert.equal(deliveredIds.length, 2);

  const sent = await db.selectFrom('notification_deliveries')
    .select(['status', 'provider_message_id'])
    .where('notification_id', '=', inbox.notifications[0]?.id)
    .execute();
  assert.ok(sent.every((row) => row.status === 'sent'));
  assert.ok(sent.every((row) => String(row.provider_message_id).startsWith('provider-')));
} finally {
  await db.deleteFrom('users').where('id', 'in', [senderId, recipientId]).execute();
  await closeDb();
}
