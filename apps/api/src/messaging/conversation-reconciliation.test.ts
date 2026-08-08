import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  decodeConversationSyncCursor,
  encodeConversationSyncCursor,
  reconcileConversationChanges
} from './conversation-reconciliation.js';

const senderId = randomUUID();
const recipientId = randomUUID();
const conversationId = randomUUID();
const messageId = randomUUID();
const createdAt = new Date('2026-08-08T08:00:00.000Z');

try {
  await db.insertInto('users').values([
    {
      id: senderId,
      email: `sync-sender-${senderId}@example.test`,
      display_name: 'Sync Sender',
      status: 'active',
      email_verified_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt
    },
    {
      id: recipientId,
      email: `sync-recipient-${recipientId}@example.test`,
      display_name: 'Sync Recipient',
      status: 'active',
      email_verified_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt
    }
  ]).execute();

  const [buyerId, sellerId] = [senderId, recipientId].sort();
  await db.insertInto('conversations').values({
    id: conversationId,
    buyer_id: buyerId,
    seller_id: sellerId,
    participant_key: `${buyerId}:${sellerId}`,
    created_at: createdAt,
    updated_at: createdAt
  }).execute();

  await db.insertInto('messages').values({
    id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    body: 'Durable sync message',
    content_fingerprint: 'sync-message',
    status: 'queued',
    created_at: createdAt,
    updated_at: createdAt
  }).execute();

  const deliveryAt = new Date('2026-08-08T08:00:01.000Z');
  const recipientSync = await reconcileConversationChanges({
    conversationId,
    userId: recipientId,
    limit: 50,
    now: deliveryAt
  });

  assert.equal(recipientSync.deliveredMessages, 1);
  assert.equal(recipientSync.changes.length, 1);
  assert.equal(recipientSync.changes[0]?.id, messageId);
  assert.equal(recipientSync.changes[0]?.status, 'delivered');
  assert.ok(recipientSync.cursor);

  const decoded = decodeConversationSyncCursor(recipientSync.cursor!);
  assert.equal(decoded.messageId, messageId);
  assert.equal(decoded.updatedAt.toISOString(), deliveryAt.toISOString());
  assert.equal(
    encodeConversationSyncCursor(decoded),
    recipientSync.cursor
  );

  const readAt = new Date('2026-08-08T08:00:02.000Z');
  await db.updateTable('messages')
    .set({ status: 'read', read_at: readAt, updated_at: readAt })
    .where('id', '=', messageId)
    .execute();

  const senderSync = await reconcileConversationChanges({
    conversationId,
    userId: senderId,
    cursor: recipientSync.cursor!,
    limit: 50,
    now: new Date('2026-08-08T08:00:03.000Z')
  });

  assert.equal(senderSync.deliveredMessages, 0);
  assert.equal(senderSync.changes.length, 1);
  assert.equal(senderSync.changes[0]?.status, 'read');
  assert.equal(senderSync.changes[0]?.readAt?.toISOString(), readAt.toISOString());

  assert.throws(
    () => decodeConversationSyncCursor('not-a-valid-cursor'),
    /Invalid conversation sync cursor/
  );
} finally {
  await db.deleteFrom('users').where('id', 'in', [senderId, recipientId]).execute();
  await closeDb();
}
