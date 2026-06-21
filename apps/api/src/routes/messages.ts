import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import {
  checkHumanProtectionWithChallenge,
  humanProtectionResponse
} from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();

const createMessageBody = z.object({
  recipientId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  body: z.string().trim().min(1).max(2000),
  clientMessageId: z.string().uuid().optional()
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.post('/messages', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = createMessageBody.parse(request.body);
    const senderId = authRequest.user.sub;

    if (body.recipientId === senderId) {
      return reply.code(400).send({ error: 'Recipient must be different' });
    }

    const accountLimit = checkRateLimit({
      group: 'messages.create.account',
      identifiers: [`account:${senderId}`],
      limit: 60,
      windowMs: 5 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'messages.create.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 180,
      windowMs: 5 * 60 * 1000
    });
    const pairLimit = checkRateLimit({
      group: 'messages.create.pair',
      identifiers: [`pair:${senderId}:${body.recipientId}`],
      limit: 20,
      windowMs: 10 * 60 * 1000
    });
    const limited = !accountLimit.allowed
      ? accountLimit
      : !ipLimit.allowed
        ? ipLimit
        : !pairLimit.allowed
          ? pairLimit
          : undefined;

    if (limited) {
      writeSecurityAudit(app.log, {
        action: 'message.create',
        decision: 'rate_limited',
        actorId: senderId,
        targetId: body.recipientId,
        ip: request.ip,
        reasonCodes: ['message_velocity_limit'],
        metadata: {
          retryAfterSeconds: limited.retryAfterSeconds
        }
      });
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'message.create',
        accountId: senderId,
        ip: request.ip,
        userAgent: firstHeader(request.headers['user-agent']),
        challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
      },
      challengeVerifier
    );

    if (protection.decision !== 'allow') {
      writeSecurityAudit(app.log, {
        action: 'message.create',
        decision: protection.decision,
        actorId: senderId,
        targetId: body.recipientId,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes
      });
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    writeSecurityAudit(app.log, {
      action: 'message.create',
      decision: 'allow',
      actorId: senderId,
      targetId: body.recipientId,
      ip: request.ip,
      riskScore: protection.riskScore,
      reasonCodes: protection.reasonCodes,
      metadata: {
        hasListingContext: Boolean(body.listingId),
        bodyLength: body.body.length
      }
    });

    return reply.code(202).send({
      accepted: true,
      senderId,
      recipientId: body.recipientId,
      listingId: body.listingId ?? null,
      clientMessageId: body.clientMessageId ?? null,
      status: 'queued'
    });
  });
}
