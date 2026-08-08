import { sql, type Kysely, type Transaction } from 'kysely';
import { db } from '../db/index.js';
import type { Database } from '../db/types.js';
import { messageSafetyPolicy } from './message-safety-policy.js';

type DbExecutor = Kysely<Database> | Transaction<Database>;

export class ConversationSafetyError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export function messagingParticipantKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join(':');
}

function counterpartId(
  conversation: { buyer_id: string; seller_id: string },
  userId: string
): string | null {
  if (conversation.buyer_id === userId) return conversation.seller_id;
  if (conversation.seller_id === userId) return conversation.buyer_id;
  return null;
}

async function conversationForParticipant(
  executor: DbExecutor,
  userId: string,
  conversationId: string
) {
  const conversation = await executor.selectFrom('conversations')
    .select(['id', 'listing_id', 'buyer_id', 'seller_id', 'participant_key'])
    .where('id', '=', conversationId)
    .executeTakeFirst();
  const counterpart = conversation ? counterpartId(conversation, userId) : null;
  if (!conversation || !counterpart) {
    throw new ConversationSafetyError(
      'conversation_not_found',
      404,
      'Conversation not found'
    );
  }
  return { conversation, counterpart };
}

export async function lockMessagingPair(
  executor: DbExecutor,
  firstId: string,
  secondId: string
): Promise<void> {
  const key = messagingParticipantKey(firstId, secondId);
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-pair:${key}`}, 0))`
    .execute(executor);
}

export async function lockMessageSender(
  executor: DbExecutor,
  senderId: string
): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`message-sender:${senderId}`}, 0))`
    .execute(executor);
}

export async function participantBlockActive(
  executor: DbExecutor,
  firstId: string,
  secondId: string
): Promise<boolean> {
  const row = await executor.selectFrom('user_blocks')
    .select(['blocker_id'])
    .where((expression) => expression.or([
      expression.and([
        expression('blocker_id', '=', firstId),
        expression('blocked_id', '=', secondId)
      ]),
      expression.and([
        expression('blocker_id', '=', secondId),
        expression('blocked_id', '=', firstId)
      ])
    ]))
    .executeTakeFirst();
  return Boolean(row);
}

export async function assertPairMessagingAvailable(
  executor: DbExecutor,
  firstId: string,
  secondId: string
): Promise<void> {
  if (await participantBlockActive(executor, firstId, secondId)) {
    throw new ConversationSafetyError(
      'messaging_unavailable',
      409,
      'Messaging is unavailable for this participant pair'
    );
  }
}

async function readConversationSafetyWith(
  executor: DbExecutor,
  userId: string,
  conversationId: string
) {
  const { conversation, counterpart } = await conversationForParticipant(
    executor,
    userId,
    conversationId
  );

  const [mute, ownBlock, anyBlock] = await Promise.all([
    executor.selectFrom('conversation_mutes')
      .select(['user_id'])
      .where('user_id', '=', userId)
      .where('conversation_id', '=', conversation.id)
      .executeTakeFirst(),
    executor.selectFrom('user_blocks')
      .select(['blocker_id'])
      .where('blocker_id', '=', userId)
      .where('blocked_id', '=', counterpart)
      .executeTakeFirst(),
    participantBlockActive(executor, userId, counterpart)
  ]);

  return {
    conversationId: conversation.id,
    counterpartId: counterpart,
    muted: Boolean(mute),
    blockedByMe: Boolean(ownBlock),
    messagingAvailable: !anyBlock
  };
}

export function readConversationSafety(userId: string, conversationId: string) {
  return readConversationSafetyWith(db, userId, conversationId);
}

export async function setConversationMuted(input: {
  userId: string;
  conversationId: string;
  muted: boolean;
}) {
  return db.transaction().execute(async (trx) => {
    await conversationForParticipant(trx, input.userId, input.conversationId);
    const now = new Date();

    if (input.muted) {
      await trx.insertInto('conversation_mutes')
        .values({
          user_id: input.userId,
          conversation_id: input.conversationId,
          created_at: now,
          updated_at: now
        })
        .onConflict((conflict) => conflict
          .columns(['user_id', 'conversation_id'])
          .doUpdateSet({ updated_at: now }))
        .execute();
    } else {
      await trx.deleteFrom('conversation_mutes')
        .where('user_id', '=', input.userId)
        .where('conversation_id', '=', input.conversationId)
        .execute();
    }

    return readConversationSafetyWith(trx, input.userId, input.conversationId);
  });
}

export async function setConversationBlocked(input: {
  userId: string;
  conversationId: string;
  blocked: boolean;
}) {
  return db.transaction().execute(async (trx) => {
    const { conversation, counterpart } = await conversationForParticipant(
      trx,
      input.userId,
      input.conversationId
    );
    await lockMessagingPair(trx, input.userId, counterpart);
    const now = new Date();

    if (input.blocked) {
      await trx.insertInto('user_blocks')
        .values({
          blocker_id: input.userId,
          blocked_id: counterpart,
          created_at: now
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();

      const related = await trx.selectFrom('conversations')
        .select(['id'])
        .where('participant_key', '=', conversation.participant_key)
        .execute();
      for (const item of related) {
        await trx.insertInto('conversation_mutes')
          .values({
            user_id: input.userId,
            conversation_id: item.id,
            created_at: now,
            updated_at: now
          })
          .onConflict((conflict) => conflict
            .columns(['user_id', 'conversation_id'])
            .doUpdateSet({ updated_at: now }))
          .execute();
      }
    } else {
      await trx.deleteFrom('user_blocks')
        .where('blocker_id', '=', input.userId)
        .where('blocked_id', '=', counterpart)
        .execute();
    }

    return readConversationSafetyWith(trx, input.userId, input.conversationId);
  });
}

function cutoff(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

function counterpartFromMessageConversation(
  row: { buyer_id: string; seller_id: string },
  senderId: string
): string | null {
  if (row.buyer_id === senderId) return row.seller_id;
  if (row.seller_id === senderId) return row.buyer_id;
  return null;
}

export async function enforceDurableMessageSpamPolicy(
  executor: DbExecutor,
  input: {
    senderId: string;
    recipientId: string;
    participantKey: string;
    fingerprint: string;
    now: Date;
  }
): Promise<void> {
  const samePair = await executor.selectFrom('messages')
    .innerJoin('conversations', 'conversations.id', 'messages.conversation_id')
    .select((expression) => expression.fn.countAll<number>().as('count'))
    .where('messages.sender_id', '=', input.senderId)
    .where('messages.content_fingerprint', '=', input.fingerprint)
    .where('messages.created_at', '>=', cutoff(
      input.now,
      messageSafetyPolicy.identicalPairWindowMinutes
    ))
    .where('conversations.participant_key', '=', input.participantKey)
    .executeTakeFirst();

  if (Number(samePair?.count ?? 0) >= messageSafetyPolicy.identicalPairMaximum) {
    throw new ConversationSafetyError(
      'message_spam_guard',
      429,
      'Repeated message limit reached',
      messageSafetyPolicy.identicalPairWindowMinutes * 60
    );
  }

  const broadcastRows = await executor.selectFrom('messages')
    .innerJoin('conversations', 'conversations.id', 'messages.conversation_id')
    .select(['conversations.buyer_id as buyer_id', 'conversations.seller_id as seller_id'])
    .where('messages.sender_id', '=', input.senderId)
    .where('messages.content_fingerprint', '=', input.fingerprint)
    .where('messages.created_at', '>=', cutoff(
      input.now,
      messageSafetyPolicy.identicalBroadcastWindowMinutes
    ))
    .orderBy('messages.created_at', 'desc')
    .limit(200)
    .execute();

  const broadcastRecipients = new Set<string>();
  for (const row of broadcastRows) {
    const counterpart = counterpartFromMessageConversation(row, input.senderId);
    if (counterpart) broadcastRecipients.add(counterpart);
  }
  if (
    !broadcastRecipients.has(input.recipientId) &&
    broadcastRecipients.size >= messageSafetyPolicy.identicalBroadcastMaximumRecipients
  ) {
    throw new ConversationSafetyError(
      'message_spam_guard',
      429,
      'Repeated broadcast message limit reached',
      messageSafetyPolicy.identicalBroadcastWindowMinutes * 60
    );
  }

  const contactRows = await executor.selectFrom('messages')
    .innerJoin('conversations', 'conversations.id', 'messages.conversation_id')
    .select(['conversations.buyer_id as buyer_id', 'conversations.seller_id as seller_id'])
    .where('messages.sender_id', '=', input.senderId)
    .where('messages.created_at', '>=', cutoff(
      input.now,
      messageSafetyPolicy.newCounterpartWindowMinutes
    ))
    .orderBy('messages.created_at', 'desc')
    .limit(500)
    .execute();

  const contacted = new Set<string>();
  for (const row of contactRows) {
    const counterpart = counterpartFromMessageConversation(row, input.senderId);
    if (counterpart) contacted.add(counterpart);
  }
  if (
    !contacted.has(input.recipientId) &&
    contacted.size >= messageSafetyPolicy.newCounterpartMaximum
  ) {
    throw new ConversationSafetyError(
      'message_spam_guard',
      429,
      'New conversation velocity limit reached',
      messageSafetyPolicy.newCounterpartWindowMinutes * 60
    );
  }
}
