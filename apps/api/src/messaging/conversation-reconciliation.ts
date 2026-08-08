import { Buffer } from 'node:buffer';
import { db } from '../db/index.js';

export interface ConversationSyncCursor {
  updatedAt: Date;
  messageId: string;
}

export interface ConversationChange {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientMessageId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  readAt: Date | null;
}

export interface ConversationSyncPage {
  changes: ConversationChange[];
  cursor: string | null;
  hasMore: boolean;
  deliveredMessages: number;
  serverTime: Date;
}

export function encodeConversationSyncCursor(input: ConversationSyncCursor): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    t: input.updatedAt.toISOString(),
    id: input.messageId
  }), 'utf8').toString('base64url');
}

export function decodeConversationSyncCursor(value: string): ConversationSyncCursor {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid conversation sync cursor');
  }

  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('Invalid conversation sync cursor');
  }

  const record = decoded as Record<string, unknown>;
  const updatedAt = typeof record.t === 'string' ? new Date(record.t) : new Date(Number.NaN);
  const messageId = typeof record.id === 'string' ? record.id : '';
  if (
    record.v !== 1 ||
    Number.isNaN(updatedAt.getTime()) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)
  ) {
    throw new Error('Invalid conversation sync cursor');
  }

  return { updatedAt, messageId };
}

export async function reconcileConversationChanges(input: {
  conversationId: string;
  userId: string;
  cursor?: string;
  limit: number;
  now?: Date;
}): Promise<ConversationSyncPage> {
  const now = input.now ?? new Date();
  const parsedCursor = input.cursor ? decodeConversationSyncCursor(input.cursor) : null;

  return db.transaction().execute(async (transaction) => {
    const delivered = await transaction.updateTable('messages')
      .set({ status: 'delivered', updated_at: now })
      .where('conversation_id', '=', input.conversationId)
      .where('sender_id', '!=', input.userId)
      .where('status', 'in', ['queued', 'sent'])
      .returning(['id'])
      .execute();

    let query = transaction.selectFrom('messages')
      .select([
        'id',
        'conversation_id',
        'sender_id',
        'body',
        'client_message_id',
        'status',
        'created_at',
        'updated_at',
        'read_at'
      ])
      .where('conversation_id', '=', input.conversationId)
      .where('status', '!=', 'removed');

    if (parsedCursor) {
      query = query.where((expression) => expression.or([
        expression('updated_at', '>', parsedCursor.updatedAt),
        expression.and([
          expression('updated_at', '=', parsedCursor.updatedAt),
          expression('id', '>', parsedCursor.messageId)
        ])
      ]));

      const rows = await query
        .orderBy('updated_at', 'asc')
        .orderBy('id', 'asc')
        .limit(input.limit + 1)
        .execute();
      const hasMore = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        changes: page.map(mapMessageChange),
        cursor: last
          ? encodeConversationSyncCursor({ updatedAt: last.updated_at, messageId: last.id })
          : input.cursor ?? null,
        hasMore,
        deliveredMessages: delivered.length,
        serverTime: now
      };
    }

    const latest = await query
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .limit(input.limit)
      .execute();
    latest.reverse();
    const last = latest.at(-1);

    return {
      changes: latest.map(mapMessageChange),
      cursor: last
        ? encodeConversationSyncCursor({ updatedAt: last.updated_at, messageId: last.id })
        : null,
      hasMore: false,
      deliveredMessages: delivered.length,
      serverTime: now
    };
  });
}

function mapMessageChange(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  client_message_id: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  read_at: Date | null;
}): ConversationChange {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    clientMessageId: row.client_message_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readAt: row.read_at
  };
}
