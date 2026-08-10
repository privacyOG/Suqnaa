import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { env } from '../config/env.js';
import { resolveSellerVerificationConfiguration } from '../config/seller-verification-config.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';
import { applySellerVerificationProviderEvent } from '../seller-verification/provider-event-service.js';
import {
  sellerVerificationProviderEventSchema,
  sellerVerificationProviderHeaderSchema,
  verifySellerVerificationEventSignature,
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

async function enforceAccountLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const account = await checkSharedRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit,
    windowMs
  });
  const ip = await checkSharedRateLimit({
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

async function enforceProviderEventLimit(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const result = await checkSharedRateLimit({
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

export async function sellerVerificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/account/seller-verification', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceAccountLimit(request, reply, authRequest.user.sub, 'seller_verification.read', 120, 5 * 60 * 1000)) return;
    const status = await readSellerVerificationStatus(authRequest.user.sub, configuration);
    if (!status) return reply.code(404).send({ error: 'Account not found' });
    return reply.send({ verification: status });
  });

  app.post('/account/seller-verification/start', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceAccountLimit(request, reply, authRequest.user.sub, 'seller_verification.start', 8, 60 * 60 * 1000)) return;
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
    if (!await enforceProviderEventLimit(request, reply)) return;

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

    try {
      const result = await applySellerVerificationProviderEvent({ headers, event });
      return reply.send({ accepted: true, event: { id: headers.eventId, ...result } });
    } catch (error) {
      if (error instanceof SellerVerificationError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });
}
