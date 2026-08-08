import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  ConversationSafetyError,
  readConversationSafety,
  setConversationBlocked,
  setConversationMuted
} from '../messaging/conversation-safety-service.js';
import { publicMessagePolicy } from '../messaging/message-safety-policy.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const conversationParams = z.object({ conversationId: z.string().uuid() });
const muteBody = z.object({ muted: z.boolean() }).strict();
const blockBody = z.object({ blocked: z.boolean() }).strict();

function limitedSafetyMutation(request: FastifyRequest, accountId: string, group: string) {
  const account = checkRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  const ip = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: 180,
    windowMs: 60 * 60 * 1000
  });
  return !account.allowed ? account : !ip.allowed ? ip : undefined;
}

function sendSafetyError(reply: any, error: unknown) {
  if (error instanceof ConversationSafetyError) {
    return reply.code(error.statusCode).send({ error: error.message, code: error.code });
  }
  throw error;
}

export async function conversationSafetyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations/:conversationId/safety', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = conversationParams.parse(request.params);
    try {
      const safety = await readConversationSafety(authRequest.user.sub, params.conversationId);
      return reply.send({ safety, policy: publicMessagePolicy() });
    } catch (caught) {
      return sendSafetyError(reply, caught);
    }
  });

  app.post('/conversations/:conversationId/mute', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = conversationParams.parse(request.params);
    const body = muteBody.parse(request.body);
    const limited = limitedSafetyMutation(request, authRequest.user.sub, 'conversation.mute');
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    try {
      const safety = await setConversationMuted({
        userId: authRequest.user.sub,
        conversationId: params.conversationId,
        muted: body.muted
      });
      writeSecurityAudit(app.log, {
        action: 'conversation.mute',
        decision: 'allow',
        actorId: authRequest.user.sub,
        targetId: safety.counterpartId,
        ip: request.ip,
        metadata: {
          conversationId: params.conversationId,
          muted: safety.muted
        }
      });
      return reply.send({ safety, policy: publicMessagePolicy() });
    } catch (caught) {
      return sendSafetyError(reply, caught);
    }
  });

  app.post('/conversations/:conversationId/block', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = conversationParams.parse(request.params);
    const body = blockBody.parse(request.body);
    const limited = limitedSafetyMutation(request, authRequest.user.sub, 'conversation.block');
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    try {
      const safety = await setConversationBlocked({
        userId: authRequest.user.sub,
        conversationId: params.conversationId,
        blocked: body.blocked
      });
      writeSecurityAudit(app.log, {
        action: 'conversation.block',
        decision: 'allow',
        actorId: authRequest.user.sub,
        targetId: safety.counterpartId,
        ip: request.ip,
        metadata: {
          conversationId: params.conversationId,
          blocked: safety.blockedByMe
        }
      });
      return reply.send({ safety, policy: publicMessagePolicy() });
    } catch (caught) {
      return sendSafetyError(reply, caught);
    }
  });
}
