import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
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

function participantKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join(':');
}

function directParticipants(firstId: string, secondId: string) {
  const sorted = [firstId, secondId].sort();
  return { buyerId: sorted[0], sellerId: sorted[1] };
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.post('/messages', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = createMessageBody.parse(request.body);
    const senderId = authRequest.user.sub;

    if (body.recipientId === senderId) {
      return reply.code(400).send({ error: 'Recipient must be different' });
    }

    if (body.clientMessageId) {
      const existingMessage = await db.selectFrom('messages')
        .select(['id', 'conversation_id', 'status', 'created_at'])
        .where('sender_id', '=', senderId)
        .where('client_message_id', '=', body.clientMessageId)
        .executeTakeFirst();

      if (existingMessage) {
        return reply.send({
          accepted: true,
          idempotent: true,
          message: {
            id: existingMessage.id,
            conversationId: existingMessage.conversation_id,
            senderId,
            recipientId: body.recipientId,
            listingId: body.listingId ?? null,
            clientMessageId: body.clientMessageId,
            status: existingMessage.status,
            createdAt: existingMessage.created_at
          }
        });
      }
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
      identifiers: [`pair:${participantKey(senderId, body.recipientId)}`],
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

    const recipient = await db.selectFrom('users')
      .select(['id'])
      .where('id', '=', body.recipientId)
      .executeTakeFirst();

    if (!recipient) {
      return reply.code(404).send({ error: 'Recipient not found' });
    }

    let buyerId: string;
    let sellerId: string;

    if (body.listingId) {
      const listing = await db.selectFrom('listings')
        .select(['id', 'seller_id'])
        .where('id', '=', body.listingId)
        .executeTakeFirst();

      if (!listing) {
        return reply.code(404).send({ error: 'Listing not found' });
      }

      if (listing.seller_id === senderId) {
        buyerId = body.recipientId;
        sellerId = senderId;
      } else if (listing.seller_id === body.recipientId) {
        buyerId = senderId;
        sellerId = body.recipientId;
      } else {
        return reply.code(400).send({ error: 'Recipient must be a listing participant' });
      }
    } else {
      const participants = directParticipants(senderId, body.recipientId);
      buyerId = participants.buyerId;
      sellerId = participants.sellerId;
    }

    const key = participantKey(buyerId, sellerId);
    const persisted = await db.transaction().execute(async (trx) => {
      let conversationQuery = trx.selectFrom('conversations')
        .select(['id'])
        .where('participant_key', '=', key);

      conversationQuery = body.listingId
        ? conversationQuery.where('listing_id', '=', body.listingId)
        : conversationQuery.where('listing_id', 'is', null);

      let conversation = await conversationQuery.executeTakeFirst();

      if (!conversation) {
        conversation = await trx.insertInto('conversations')
          .values({
            listing_id: body.listingId ?? null,
            buyer_id: buyerId,
            seller_id: sellerId,
            participant_key: key,
            updated_at: new Date()
          })
          .onConflict((conflict) => conflict.doNothing())
          .returning(['id'])
          .executeTakeFirst();
      }

      if (!conversation) {
        let retryQuery = trx.selectFrom('conversations')
          .select(['id'])
          .where('participant_key', '=', key);

        retryQuery = body.listingId
          ? retryQuery.where('listing_id', '=', body.listingId)
          : retryQuery.where('listing_id', 'is', null);

        conversation = await retryQuery.executeTakeFirstOrThrow();
      }

      let message = await trx.insertInto('messages')
        .values({
          conversation_id: conversation.id,
          sender_id: senderId,
          body: body.body,
          client_message_id: body.clientMessageId ?? null,
          status: 'queued',
          updated_at: new Date()
        })
        .onConflict((conflict) => conflict.doNothing())
        .returning(['id', 'conversation_id', 'status', 'created_at'])
        .executeTakeFirst();

      let created = true;
      if (!message && body.clientMessageId) {
        message = await trx.selectFrom('messages')
          .select(['id', 'conversation_id', 'status', 'created_at'])
          .where('sender_id', '=', senderId)
          .where('client_message_id', '=', body.clientMessageId)
          .executeTakeFirst();
        created = false;
      }

      if (!message) {
        throw new Error('Message persistence failed');
      }

      await trx.updateTable('conversations')
        .set({ updated_at: new Date() })
        .where('id', '=', conversation.id)
        .execute();

      return { message, created };
    });

    writeSecurityAudit(app.log, {
      action: 'message.create',
      decision: 'allow',
      actorId: senderId,
      targetId: body.recipientId,
      ip: request.ip,
      riskScore: protection.riskScore,
      reasonCodes: protection.reasonCodes,
      metadata: {
        conversationId: persisted.message.conversation_id,
        messageId: persisted.message.id,
        idempotent: !persisted.created,
        hasListingContext: Boolean(body.listingId),
        bodyLength: body.body.length
      }
    });

    return reply.code(persisted.created ? 201 : 200).send({
      accepted: true,
      idempotent: !persisted.created,
      message: {
        id: persisted.message.id,
        conversationId: persisted.message.conversation_id,
        senderId,
        recipientId: body.recipientId,
        listingId: body.listingId ?? null,
        clientMessageId: body.clientMessageId ?? null,
        status: persisted.message.status,
        createdAt: persisted.message.created_at
      }
    });
  });
}
