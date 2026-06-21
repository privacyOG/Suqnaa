import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
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

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.user.sub;
    const query = conversationListQuery.parse(request.query);

    if (!enforceReadLimit(request, reply, userId, 'conversations.list', 120, 300)) {
      return;
    }

    let conversationsQuery = db.selectFrom('conversations')
      .select(['id', 'listing_id', 'buyer_id', 'seller_id', 'created_at', 'updated_at'])
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

      const [counterpart, latestMessage] = await Promise.all([
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
              createdAt: latestMessage.created_at
            }
          : null,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at
      };
    }));

    const last = page.at(-1);
    return reply.send({
      conversations,
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
      .select(['id', 'listing_id', 'buyer_id', 'seller_id'])
      .where('id', '=', params.conversationId)
      .executeTakeFirst();

    if (!conversation || !isParticipant(conversation, userId)) {
      writeSecurityAudit(app.log, {
        action: 'conversation.messages.read',
        decision: 'reject',
        actorId: userId,
        targetId: params.conversationId,
        ip: request.ip,
        reasonCodes: ['conversation_access_denied']
      });
      return reply.code(404).send({ error: 'Conversation not found' });
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
        sellerId: conversation.seller_id
      },
      messages: page.map((message) => ({
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        body: message.body,
        clientMessageId: message.client_message_id,
        status: message.status,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
        readAt: message.read_at
      })),
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.created_at).toISOString()
          : null
      }
    });
  });
}
