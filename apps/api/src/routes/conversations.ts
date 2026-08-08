import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { publicMessagePolicy } from '../messaging/message-safety-policy.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const conversationListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional()
});

const conversationParams = z.object({
  conversationId: z.string().uuid()
});

const messageListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional()
});

function enforceReadLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  accountLimit: number,
  ipLimit: number
): boolean {
  const perAccount = checkRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit: accountLimit,
    windowMs: 5 * 60 * 1000
  });
  const perIp = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: ipLimit,
    windowMs: 5 * 60 * 1000
  });
  const limited = !perAccount.allowed ? perAccount : !perIp.allowed ? perIp : undefined;

  if (!limited) {
    return true;
  }

  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

function isParticipant(
  conversation: { buyer_id: string; seller_id: string },
  userId: string
): boolean {
  return conversation.buyer_id === userId || conversation.seller_id === userId;
}

function rejectConversationAccess(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  conversationId: string,
  action: string
) {
  writeSecurityAudit(app.log, {
    action,
    decision: 'reject',
    actorId: userId,
    targetId: conversationId,
    ip: request.ip,
    reasonCodes: ['conversation_access_denied']
  });

  return reply.code(404).send({ error: 'Conversation not found' });
}

function counterpartSql(userId: string) {
  return sql`CASE
    WHEN conversations.buyer_id = ${userId} THEN conversations.seller_id
    ELSE conversations.buyer_id
  END`;
}

function safetySelect(userId: string) {
  const counterpart = counterpartSql(userId);
  return [
    sql<boolean>`EXISTS (
      SELECT 1 FROM conversation_mutes cm
      WHERE cm.user_id = ${userId}
        AND cm.conversation_id = conversations.id
    )`.as('muted'),
    sql<boolean>`EXISTS (
      SELECT 1 FROM user_blocks ub
      WHERE ub.blocker_id = ${userId}
        AND ub.blocked_id = ${counterpart}
    )`.as('blocked_by_me'),
    sql<boolean>`NOT EXISTS (
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ${userId} AND ub.blocked_id = ${counterpart})
         OR (ub.blocker_id = ${counterpart} AND ub.blocked_id = ${userId})
    )`.as('messaging_available')
  ];
}

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.user.sub;
    const query = conversationListQuery.parse(request.query);

    if (!enforceReadLimit(request, reply, userId, 'conversations.list', 120, 300)) {
      return;
    }

    let conversationsQuery = db.selectFrom('conversations')
      .select([
        'id', 'listing_id', 'buyer_id', 'seller_id', 'created_at', 'updated_at',
        ...safetySelect(userId)
      ])
      .where((expression) => expression.or([
        expression('buyer_id', '=', userId),
        expression('seller_id', '=', userId)
      ]));

    if (query.before) {
      conversationsQuery = conversationsQuery.where('updated_at', '<', new Date(query.before));
    }

    const rows = await conversationsQuery
      .orderBy('updated_at', 'desc')
      .limit(query.limit + 1)
      .execute();

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const conversations = await Promise.all(page.map(async (conversation) => {
      const counterpartId = conversation.buyer_id === userId
        ? conversation.seller_id
        : conversation.buyer_id;

      const [counterpart, latestMessage, unread] = await Promise.all([
        db.selectFrom('users')
          .select(['id', 'display_name', 'status'])
          .where('id', '=', counterpartId)
          .executeTakeFirst(),
        db.selectFrom('messages')
          .select(['id', 'sender_id', 'body', 'status', 'created_at'])
          .where('conversation_id', '=', conversation.id)
          .where('status', '!=', 'removed')
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirst(),
        db.selectFrom('messages')
          .select((expression) => expression.fn.countAll<number>().as('count'))
          .where('conversation_id', '=', conversation.id)
          .where('sender_id', '!=', userId)
          .where('read_at', 'is', null)
          .where('status', '!=', 'removed')
          .executeTakeFirst()
      ]);

      return {
        id: conversation.id,
        listingId: conversation.listing_id,
        counterpart: counterpart
          ? {
              id: counterpart.id,
              displayName: counterpart.display_name,
              status: counterpart.status
            }
          : null,
        latestMessage: latestMessage
          ? {
              id: latestMessage.id,
              senderId: latestMessage.sender_id,
              body: latestMessage.body,
              status: latestMessage.status,
              createdAt: latestMessage.created_at,
              attachments: []
            }
          : null,
        unreadCount: Number(unread?.count ?? 0),
        safety: {
          muted: Boolean(conversation.muted),
          blockedByMe: Boolean(conversation.blocked_by_me),
          messagingAvailable: Boolean(conversation.messaging_available)
        },
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at
      };
    }));

    const last = page.at(-1);
    return reply.send({
      conversations,
      policy: publicMessagePolicy(),
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.updated_at).toISOString()
          : null
      }
    });
  });

  app.get('/conversations/:conversationId/messages', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.user.sub;
    const params = conversationParams.parse(request.params);
    const query = messageListQuery.parse(request.query);

    if (!enforceReadLimit(request, reply, userId, 'conversations.messages', 300, 600)) {
      return;
    }

    const conversation = await db.selectFrom('conversations')
      .select([
        'id', 'listing_id', 'buyer_id', 'seller_id',
        ...safetySelect(userId)
      ])
      .where('id', '=', params.conversationId)
      .executeTakeFirst();

    if (!conversation || !isParticipant(conversation, userId)) {
      return rejectConversationAccess(
        app,
        request,
        reply,
        userId,
        params.conversationId,
        'conversation.messages.read'
      );
    }

    let messagesQuery = db.selectFrom('messages')
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
      .where('conversation_id', '=', conversation.id)
      .where('status', '!=', 'removed');

    if (query.before) {
      messagesQuery = messagesQuery.where('created_at', '<', new Date(query.before));
    }

    const rows = await messagesQuery
      .orderBy('created_at', 'desc')
      .limit(query.limit + 1)
      .execute();

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return reply.send({
      conversation: {
        id: conversation.id,
        listingId: conversation.listing_id,
        buyerId: conversation.buyer_id,
        sellerId: conversation.seller_id,
        safety: {
          muted: Boolean(conversation.muted),
          blockedByMe: Boolean(conversation.blocked_by_me),
          messagingAvailable: Boolean(conversation.messaging_available)
        }
      },
      policy: publicMessagePolicy(),
      messages: page.map((message) => ({
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        body: message.body,
        clientMessageId: message.client_message_id,
        status: message.status,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
        readAt: message.read_at,
        attachments: []
      })),
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.created_at).toISOString()
          : null
      }
    });
  });

  app.post('/conversations/:conversationId/read', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.user.sub;
    const params = conversationParams.parse(request.params);

    if (!enforceReadLimit(request, reply, userId, 'conversations.mark_read', 120, 300)) {
      return;
    }

    const conversation = await db.selectFrom('conversations')
      .select(['id', 'buyer_id', 'seller_id'])
      .where('id', '=', params.conversationId)
      .executeTakeFirst();

    if (!conversation || !isParticipant(conversation, userId)) {
      return rejectConversationAccess(
        app,
        request,
        reply,
        userId,
        params.conversationId,
        'conversation.messages.mark_read'
      );
    }

    const now = new Date();
    const updated = await db.updateTable('messages')
      .set({
        read_at: now,
        status: 'read',
        updated_at: now
      })
      .where('conversation_id', '=', conversation.id)
      .where('sender_id', '!=', userId)
      .where('read_at', 'is', null)
      .where('status', 'in', ['queued', 'sent', 'delivered'])
      .returning(['id'])
      .execute();

    writeSecurityAudit(app.log, {
      action: 'conversation.messages.mark_read',
      decision: 'allow',
      actorId: userId,
      targetId: conversation.id,
      ip: request.ip,
      metadata: {
        updatedMessages: updated.length
      }
    });

    return reply.send({
      conversationId: conversation.id,
      updatedMessages: updated.length,
      readAt: now.toISOString()
    });
  });
}
