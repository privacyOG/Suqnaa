import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

const challengeVerifier = new NoopChallengeVerifier();

const reportReason = z.enum([
  'prohibited_item',
  'scam',
  'counterfeit',
  'harassment',
  'spam',
  'wrong_category',
  'unsafe',
  'other'
]);

const reportBody = z.object({
  listingId: z.string().uuid().optional(),
  reportedUserId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  reason: reportReason,
  details: z.string().trim().max(1200).optional()
}).strict().superRefine((value, context) => {
  if (!value.listingId && !value.reportedUserId && !value.messageId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['listingId'],
      message: 'A listing, user, or message must be reported'
    });
  }
  if (value.messageId && (value.listingId || value.reportedUserId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['messageId'],
      message: 'Message reports derive conversation and account context from the message'
    });
  }
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function limitedReportCreate(request: FastifyRequest, accountId: string) {
  const accountLimit = await checkSharedRateLimit({
    group: 'report.create.account',
    identifiers: [`account:${accountId}`],
    limit: 20,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = await checkSharedRateLimit({
    group: 'report.create.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 80,
    windowMs: 60 * 60 * 1000
  });

  return !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.post('/reports', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = reportBody.parse(request.body);
    const limited = await limitedReportCreate(request, authRequest.user.sub);

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'report.create',
        accountId: authRequest.user.sub,
        ip: request.ip,
        userAgent: firstHeader(request.headers['user-agent']),
        challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
      },
      challengeVerifier
    );

    if (protection.decision !== 'allow') {
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    let listingId = body.listingId ?? null;
    let reportedUserId = body.reportedUserId ?? null;
    let conversationId: string | null = null;
    let messageId: string | null = body.messageId ?? null;

    if (messageId) {
      const message = await db.selectFrom('messages')
        .innerJoin('conversations', 'conversations.id', 'messages.conversation_id')
        .innerJoin('users', 'users.id', 'messages.sender_id')
        .select([
          'messages.id as id',
          'messages.sender_id as sender_id',
          'messages.conversation_id as conversation_id',
          'conversations.buyer_id as buyer_id',
          'conversations.seller_id as seller_id',
          'users.status as sender_status'
        ])
        .where('messages.id', '=', messageId)
        .executeTakeFirst();

      if (!message || (
        message.buyer_id !== authRequest.user.sub &&
        message.seller_id !== authRequest.user.sub
      )) {
        return reply.code(404).send({ error: 'Message not found' });
      }
      if (message.sender_id === authRequest.user.sub) {
        return reply.code(409).send({ error: 'You cannot report your own message' });
      }
      if (message.sender_status === 'closed') {
        return reply.code(404).send({ error: 'Reported user not found' });
      }

      conversationId = message.conversation_id;
      reportedUserId = message.sender_id;
      listingId = null;
    } else if (listingId) {
      const listing = await db.selectFrom('listings')
        .innerJoin('users', 'users.id', 'listings.seller_id')
        .select([
          'listings.id as id',
          'listings.seller_id as seller_id',
          'listings.status as listing_status',
          'users.status as seller_status'
        ])
        .where('listings.id', '=', listingId)
        .where('listings.status', '=', 'active')
        .executeTakeFirst();

      if (!listing || listing.seller_status === 'suspended' || listing.seller_status === 'closed') {
        return reply.code(404).send({ error: 'Listing not found' });
      }

      if (listing.seller_id === authRequest.user.sub) {
        return reply.code(409).send({ error: 'You cannot report your own listing' });
      }

      if (reportedUserId && reportedUserId !== listing.seller_id) {
        return reply.code(400).send({ error: 'Reported user does not own this listing' });
      }

      reportedUserId = listing.seller_id;
    }

    if (reportedUserId && !messageId) {
      if (reportedUserId === authRequest.user.sub) {
        return reply.code(409).send({ error: 'You cannot report yourself' });
      }

      const reportedUser = await db.selectFrom('users')
        .select(['id', 'status'])
        .where('id', '=', reportedUserId)
        .executeTakeFirst();

      if (!reportedUser || reportedUser.status === 'closed') {
        return reply.code(404).send({ error: 'Reported user not found' });
      }
    }

    let duplicateQuery = db.selectFrom('reports')
      .select(['id', 'created_at'])
      .where('reporter_id', '=', authRequest.user.sub)
      .where('resolved_at', 'is', null);

    if (messageId) {
      duplicateQuery = duplicateQuery.where('message_id', '=', messageId);
    } else {
      duplicateQuery = listingId
        ? duplicateQuery.where('listing_id', '=', listingId)
        : duplicateQuery.where('listing_id', 'is', null);
      duplicateQuery = reportedUserId
        ? duplicateQuery.where('reported_user_id', '=', reportedUserId)
        : duplicateQuery.where('reported_user_id', 'is', null);
      duplicateQuery = duplicateQuery.where('message_id', 'is', null);
    }

    const existingReport = await duplicateQuery.executeTakeFirst();
    if (existingReport) {
      return reply.send({
        report: {
          id: existingReport.id,
          status: 'already_reported',
          createdAt: existingReport.created_at
        }
      });
    }

    const inserted = await db.insertInto('reports')
      .values({
        reporter_id: authRequest.user.sub,
        listing_id: listingId,
        reported_user_id: reportedUserId,
        conversation_id: conversationId,
        message_id: messageId,
        reason: body.reason,
        details: body.details || null
      })
      .returning([
        'id', 'listing_id', 'reported_user_id', 'conversation_id', 'message_id',
        'reason', 'created_at'
      ])
      .executeTakeFirstOrThrow();

    writeSecurityAudit(app.log, {
      action: 'report.create',
      decision: 'allow',
      actorId: authRequest.user.sub,
      targetId: inserted.message_id ?? inserted.listing_id ?? inserted.reported_user_id ?? undefined,
      ip: request.ip,
      riskScore: protection.riskScore,
      reasonCodes: protection.reasonCodes,
      metadata: {
        reportId: inserted.id,
        listingId: inserted.listing_id,
        reportedUserId: inserted.reported_user_id,
        conversationId: inserted.conversation_id,
        messageId: inserted.message_id,
        reason: inserted.reason
      }
    });

    return reply.code(201).send({
      report: {
        id: inserted.id,
        status: 'submitted',
        listingId: inserted.listing_id,
        reportedUserId: inserted.reported_user_id,
        conversationId: inserted.conversation_id,
        messageId: inserted.message_id,
        reason: inserted.reason,
        createdAt: inserted.created_at
      }
    });
  });
}
