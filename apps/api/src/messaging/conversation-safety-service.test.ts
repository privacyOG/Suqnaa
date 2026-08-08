import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  ConversationSafetyError,
  enforceDurableMessageSpamPolicy,
  messagingParticipantKey,
  readConversationSafety,
  setConversationBlocked,
  setConversationMuted
} from './conversation-safety-service.js';

const senderId = randomUUID();
const recipientId = randomUUID();
const extraIds = Array.from({ length: 16 }, () => randomUUID());
const allUserIds = [senderId, recipientId, ...extraIds];
const now = new Date();

async function createConversation(firstId: string, secondId: string) {
  const id = randomUUID();
  const [buyerId, sellerId] = [firstId, secondId].sort();
  await db.insertInto('conversations').values({
    id,
    buyer_id: buyerId,
    seller_id: sellerId,
    participant_key: messagingParticipantKey(firstId, secondId),
    created_at: now,
    updated_at: now
  }).execute();
  return id;
}

async function insertMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  fingerprint: string;
}) {
  const id = randomUUID();
  await db.insertInto('messages').values({
    id,
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body,
    content_fingerprint: input.fingerprint,
    status: 'sent',
    created_at: now,
    updated_at: now
  }).execute();
  return id;
}

try {
  await db.insertInto('users').values(allUserIds.map((id, index) => ({
    id,
    email: `conversation-safety-${index}-${id}@example.test`,
    display_name: `Safety User ${index}`,
    status: 'active',
    email_verified_at: now,
    created_at: now,
    updated_at: now
  }))).execute();

  const conversationId = await createConversation(senderId, recipientId);

  const muted = await setConversationMuted({
    userId: senderId,
    conversationId,
    muted: true
  });
  assert.equal(muted.muted, true);
  assert.equal(muted.messagingAvailable, true);

  const blocked = await setConversationBlocked({
    userId: senderId,
    conversationId,
    blocked: true
  });
  assert.equal(blocked.blockedByMe, true);
  assert.equal(blocked.muted, true);
  assert.equal(blocked.messagingAvailable, false);

  const recipientView = await readConversationSafety(recipientId, conversationId);
  assert.equal(recipientView.blockedByMe, false);
  assert.equal(recipientView.messagingAvailable, false);

  await assert.rejects(
    db.insertInto('messages').values({
      conversation_id: conversationId,
      sender_id: recipientId,
      body: 'Blocked write attempt',
      content_fingerprint: 'blocked-write',
      status: 'sent',
      created_at: now,
      updated_at: now
    }).execute(),
    /participant block is active/
  );

  const unblocked = await setConversationBlocked({
    userId: senderId,
    conversationId,
    blocked: false
  });
  assert.equal(unblocked.blockedByMe, false);
  assert.equal(unblocked.messagingAvailable, true);
  assert.equal(unblocked.muted, true);

  const unmuted = await setConversationMuted({
    userId: senderId,
    conversationId,
    muted: false
  });
  assert.equal(unmuted.muted, false);

  const reportedMessageId = await insertMessage({
    conversationId,
    senderId,
    body: 'Message report target',
    fingerprint: 'report-target'
  });
  const report = await db.insertInto('reports').values({
    reporter_id: recipientId,
    reported_user_id: senderId,
    conversation_id: conversationId,
    message_id: reportedMessageId,
    reason: 'spam',
    created_at: now
  }).returning(['id']).executeTakeFirstOrThrow();
  assert.ok(report.id);

  await assert.rejects(
    db.insertInto('reports').values({
      reporter_id: senderId,
      reported_user_id: senderId,
      conversation_id: conversationId,
      message_id: reportedMessageId,
      reason: 'spam',
      created_at: now
    }).execute(),
    /cannot report their own message/
  );

  const repeatedFingerprint = 'repeat-pair-fingerprint';
  for (let index = 0; index < 3; index += 1) {
    await insertMessage({
      conversationId,
      senderId,
      body: `Repeated pair message ${index}`,
      fingerprint: repeatedFingerprint
    });
  }
  await assert.rejects(
    enforceDurableMessageSpamPolicy(db, {
      senderId,
      recipientId,
      participantKey: messagingParticipantKey(senderId, recipientId),
      fingerprint: repeatedFingerprint,
      now
    }),
    (error) => error instanceof ConversationSafetyError && error.code === 'message_spam_guard'
  );

  const broadcastFingerprint = 'repeat-broadcast-fingerprint';
  for (const targetId of extraIds.slice(0, 3)) {
    const id = await createConversation(senderId, targetId);
    await insertMessage({
      conversationId: id,
      senderId,
      body: 'Repeated broadcast content',
      fingerprint: broadcastFingerprint
    });
  }
  await assert.rejects(
    enforceDurableMessageSpamPolicy(db, {
      senderId,
      recipientId: extraIds[3]!,
      participantKey: messagingParticipantKey(senderId, extraIds[3]!),
      fingerprint: broadcastFingerprint,
      now
    }),
    (error) => error instanceof ConversationSafetyError && error.code === 'message_spam_guard'
  );

  for (let index = 3; index < 12; index += 1) {
    const targetId = extraIds[index]!;
    const id = await createConversation(senderId, targetId);
    await insertMessage({
      conversationId: id,
      senderId,
      body: `Distinct recent contact ${index}`,
      fingerprint: `distinct-contact-${index}`
    });
  }
  await assert.rejects(
    enforceDurableMessageSpamPolicy(db, {
      senderId,
      recipientId: extraIds[12]!,
      participantKey: messagingParticipantKey(senderId, extraIds[12]!),
      fingerprint: 'new-contact-target',
      now
    }),
    (error) => error instanceof ConversationSafetyError && error.code === 'message_spam_guard'
  );

  const outsiderId = extraIds[15]!;
  await assert.rejects(
    readConversationSafety(outsiderId, conversationId),
    (error) => error instanceof ConversationSafetyError && error.code === 'conversation_not_found'
  );

  console.log('Conversation safety persistence tests passed.');
} finally {
  await db.deleteFrom('users').where('id', 'in', allUserIds).execute();
  await closeDb();
}
