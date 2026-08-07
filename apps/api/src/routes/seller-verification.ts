import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { env } from '../config/env.js';
import { resolveSellerVerificationConfiguration } from '../config/seller-verification-config.js';
import { db } from '../db/index.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import {
  sellerVerificationEventFingerprint,
  sellerVerificationProviderEventSchema,
  sellerVerificationProviderHeaderSchema,
  verifySellerVerificationEventSignature,
  type SellerVerificationProviderEvent,
  type SellerVerificationProviderHeaders
} from '../seller-verification/provider-event.js';
import { createSellerVerificationProvider } from '../seller-verification/provider.js';
import {
  readSellerVerificationStatus,
  SellerVerificationError,
  startSellerVerification
} from '../seller-verification/service.js';

const configuration = resolveSellerVerificationConfiguration({
  provider: env.SELLER_VERIFICATION_PROVIDER,
  endpoint: env.SELLER_VERIFICATION_URL,
  token: env.SELLER_VERIFICATION_TOKEN,
  signingSecret: env.SELLER_VERIFICATION_SIGNING_SECRET,
  timeoutMs: env.SELLER_VERIFICATION_TIMEOUT_MS,
  eventMaxAgeSeconds: env.SELLER_VERIFICATION_EVENT_MAX_AGE_SECONDS,
  verifiedValidityDays: env.SELLER_VERIFICATION_VALID_DAYS,
  nodeEnv: env.NODE_ENV
});
const provider = createSellerVerificationProvider(configuration);
const challengeVerifier = new NoopChallengeVerifier();

const startBody = z.object({
  level: z.enum(['seller', 'business']),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase())
}).strict();

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function providerEventHeaders(request: FastifyRequest): SellerVerificationProviderHeaders {
  return sellerVerificationProviderHeaderSchema.parse({
    provider: firstHeader(request.headers['x-suqnaa-verification-provider']),
    eventId: firstHeader(request.headers['x-suqnaa-verification-event-id']),
    timestamp: firstHeader(request.headers['x-suqnaa-verification-event-timestamp']),
    signature: firstHeader(request.headers['x-suqnaa-verification-signature'])
  });
}

function enforceAccountLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  limit: number,
  windowMs: number
): boolean {
  const account = checkRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit,
    windowMs
  });
  const ip = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: limit * 4,
    windowMs
  });
  const limited = !account.allowed ? account : !ip.allowed ? ip : undefined;
  if (!limited) return true;
  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

function enforceProviderEventLimit(request: FastifyRequest, reply: FastifyReply): boolean {
  const result = checkRateLimit({
    group: 'seller_verification.provider_event.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 300,
    windowMs: 5 * 60 * 1000
  });
  if (result.allowed) return true;
  reply.header('Retry-After', String(result.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(result));
  return false;
}

function eventMatches(
  existing: Record<string, any>,
  headers: SellerVerificationProviderHeaders,
  event: SellerVerificationProviderEvent,
  fingerprint: string
): boolean {
  return existing.provider === headers.provider &&
    existing.provider_event_id === headers.eventId &&
    existing.event_type === event.type &&
    existing.provider_reference === event.providerReference &&
    existing.payload_fingerprint === fingerprint;
}

export async function sellerVerificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/account/seller-verification', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!enforceAccountLimit(request, reply, authRequest.user.sub, 'seller_verification.read', 120, 5 * 60 * 1000)) return;
    const status = await readSellerVerificationStatus(authRequest.user.sub, configuration);
    if (!status) return reply.code(404).send({ error: 'Account not found' });
    return reply.send({ verification: status });
  });

  app.post('/account/seller-verification/start', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!enforceAccountLimit(request, reply, authRequest.user.sub, 'seller_verification.start', 8, 60 * 60 * 1000)) return;
    const body = startBody.parse(request.body);
    const protection = await checkHumanProtectionWithChallenge({
      action: 'account.seller_verification_start',
      accountId: authRequest.user.sub,
      ip: request.ip,
      userAgent: firstHeader(request.headers['user-agent']),
      challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
    }, challengeVerifier);
    if (protection.decision !== 'allow') {
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    try {
      const session = await startSellerVerification({
        userId: authRequest.user.sub,
        level: body.level,
        countryCode: body.countryCode,
        configuration,
        provider
      });
      writeSecurityAudit(app.log, {
        action: 'account.seller_verification_start',
        decision: 'allow',
        actorId: authRequest.user.sub,
        targetId: session.checkId,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes,
        metadata: { level: body.level, action: session.action }
      });
      return reply.send({ session });
    } catch (error) {
      if (error instanceof SellerVerificationError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.post('/seller-verification/provider-events', async (request, reply) => {
    if (!configuration.enabled) {
      return reply.code(503).send({ error: 'Seller verification event ingestion is unavailable' });
    }
    if (!enforceProviderEventLimit(request, reply)) return;

    const headers = providerEventHeaders(request);
    const event = sellerVerificationProviderEventSchema.parse(request.body);
    const verification = verifySellerVerificationEventSignature(configuration, headers, event);
    if (!verification.verified) {
      writeSecurityAudit(app.log, {
        action: 'seller_verification.provider_event',
        decision: 'reject',
        ip: request.ip,
        reasonCodes: [verification.reason],
        metadata: { eventId: headers.eventId, eventType: event.type }
      });
      return reply.code(401).send({ error: 'Seller verification event signature is invalid' });
    }

    const occurredAt = new Date(event.occurredAt);
    if (occurredAt.getTime() > Date.now() + 60_000) {
      return reply.code(400).send({ error: 'Seller verification event time is invalid' });
    }
    const fingerprint = sellerVerificationEventFingerprint(headers.provider, event);

    try {
      const result = await db.transaction().execute(async (transaction) => {
        const existing = await transaction.selectFrom('verification_provider_events')
          .select([
            'provider', 'provider_event_id', 'event_type',
            'provider_reference', 'payload_fingerprint', 'verification_check_id'
          ])
          .where('provider', '=', headers.provider)
          .where('provider_event_id', '=', headers.eventId)
          .executeTakeFirst();
        if (existing) {
          if (!eventMatches(existing, headers, event, fingerprint)) {
            throw new SellerVerificationError(409, 'event_replay_conflict', 'Seller verification event conflicts with an earlier event');
          }
          return { checkId: String(existing.verification_check_id), duplicate: true, unchanged: true };
        }

        const check = await transaction.selectFrom('verification_checks')
          .select(['id', 'user_id', 'status', 'provider_result', 'provider', 'reference', 'last_provider_event_at'])
          .where('provider', '=', headers.provider)
          .where('reference', '=', event.providerReference)
          .forUpdate()
          .executeTakeFirst();
        if (!check) {
          throw new SellerVerificationError(404, 'verification_not_found', 'Seller verification event context was not found');
        }
        if (check.last_provider_event_at && occurredAt.getTime() < new Date(check.last_provider_event_at).getTime()) {
          throw new SellerVerificationError(409, 'stale_provider_event', 'Seller verification event is older than the latest event');
        }

        await transaction.insertInto('verification_provider_events').values({
          provider: headers.provider,
          provider_event_id: headers.eventId,
          verification_check_id: check.id,
          event_type: event.type,
          provider_reference: event.providerReference,
          payload_fingerprint: fingerprint,
          occurred_at: occurredAt,
          received_at: new Date()
        }).execute();

        let unchanged = check.status !== 'pending';
        if (!unchanged) {
          const nextStatus = event.result === 'expired' ? 'expired' : 'pending';
          const nextProviderResult = event.result;
          await transaction.updateTable('verification_checks')
            .set({
              status: nextStatus,
              provider_result: nextProviderResult,
              reason_code: event.reasonCode ?? (event.result === 'expired' ? 'provider_session_expired' : null),
              provider_completed_at: event.result === 'expired' ? null : occurredAt,
              last_provider_event_at: occurredAt,
              updated_at: new Date()
            })
            .where('id', '=', check.id)
            .where('status', '=', 'pending')
            .execute();
          await transaction.insertInto('audit_logs').values({
            actor_user_id: check.user_id,
            action: 'seller_verification.provider_result',
            entity_type: 'verification_check',
            entity_id: check.id,
            metadata: {
              provider: headers.provider,
              result: event.result,
              reasonCode: event.reasonCode ?? null,
              eventId: headers.eventId
            },
            created_at: new Date()
          }).execute();
        }

        return { checkId: String(check.id), duplicate: false, unchanged };
      });

      return reply.send({ accepted: true, event: { id: headers.eventId, ...result } });
    } catch (error) {
      if (error instanceof SellerVerificationError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });
}
