import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { reconcileConversationChanges } from '../messaging/conversation-reconciliation.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

const paramsSchema = z.object({
  conversationId: z.string().uuid()
});

const querySchema = z.object({
  cursor: z.string().min(1).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).strict();

function isParticipant(
  conversation: { buyer_id: string; seller_id: string },
  userId: string
): boolean {
  return conversation.buyer_id === userId || conversation.seller_id === userId;
}

async function enforceSyncLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string
): Promise<boolean> {
  const perAccount = await checkSharedRateLimit({
    group: 'conversation.sync.account',
    identifiers: [`account:${userId}`],
    limit: 180,
    windowMs: 5 * 60 * 1000
  });
  const perIp = await checkSharedRateLimit({
    group: 'conversation.sync.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 480,
    windowMs: 5 * 60 * 1000
  });
  const limited = !perAccount.allowed ? perAccount : !perIp.allowed ? perIp : undefined;
  if (!limited) return true;

  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

export async function conversationSyncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations/:conversationId/sync', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.user.sub;
    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    if (!await enforceSyncLimit(request, reply, userId)) return;

    const conversation = await db.selectFrom('conversations')
      .select(['id', 'buyer_id', 'seller_id'])
      .where('id', '=', params.conversationId)
      .executeTakeFirst();

    if (!conversation || !isParticipant(conversation, userId)) {
      writeSecurityAudit(app.log, {
        action: 'conversation.sync',
        decision: 'reject',
        actorId: userId,
        targetId: params.conversationId,
        ip: request.ip,
        reasonCodes: ['conversation_access_denied']
      });
      return reply.code(404).send({ error: 'Conversation not found' });
    }

    try {
      const result = await reconcileConversationChanges({
        conversationId: conversation.id,
        userId,
        cursor: query.cursor,
        limit: query.limit
      });

      return reply.send({
        conversationId: conversation.id,
        changes: result.changes.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
          readAt: message.readAt?.toISOString() ?? null,
          attachments: []
        })),
        reconciliation: {
          deliveredMessages: result.deliveredMessages,
          serverTime: result.serverTime.toISOString()
        },
        pagination: {
          cursor: result.cursor,
          hasMore: result.hasMore,
          pollAfterMs: result.hasMore ? 0 : 3000
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid conversation sync cursor') {
        return reply.code(400).send({ error: 'Invalid conversation sync cursor' });
      }
      throw error;
    }
  });
}
