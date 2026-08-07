import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { env } from '../config/env.js';
import {
  createVerificationDeliveryProvider,
  type VerificationChannel
} from '../account-verification/provider.js';
import {
  confirmContactVerification,
  loadVerificationState,
  requestContactVerification,
  VerificationDeliveryError
} from '../account-verification/service.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const channelSchema = z.enum(['email', 'phone']);
const requestBodySchema = z.object({ channel: channelSchema });
const confirmBodySchema = z.object({
  channel: channelSchema,
  code: z.string().max(32)
});

const deliveryProvider = createVerificationDeliveryProvider({
  mode: env.VERIFICATION_DELIVERY_PROVIDER,
  nodeEnv: env.NODE_ENV,
  endpoint: env.VERIFICATION_DELIVERY_URL,
  token: env.VERIFICATION_DELIVERY_TOKEN,
  timeoutMs: env.VERIFICATION_DELIVERY_TIMEOUT_MS
});

function accountId(request: AuthenticatedRequest): string {
  return request.user.sub;
}

function requestLimit(
  request: AuthenticatedRequest,
  channel: VerificationChannel
) {
  return checkRateLimit({
    group: 'account.contact_verification.request',
    identifiers: [
      `account:${accountId(request)}:${channel}`,
      `ip:${request.ip}`
    ],
    limit: 12,
    windowMs: 15 * 60 * 1000
  });
}

function confirmLimit(
  request: AuthenticatedRequest,
  channel: VerificationChannel
) {
  const account = checkRateLimit({
    group: 'account.contact_verification.confirm.account',
    identifiers: [`account:${accountId(request)}:${channel}`],
    limit: 15,
    windowMs: 15 * 60 * 1000
  });
  if (!account.allowed) {
    return account;
  }

  return checkRateLimit({
    group: 'account.contact_verification.confirm.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 60,
    windowMs: 15 * 60 * 1000
  });
}

export async function accountVerificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/account/verification', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const state = await loadVerificationState(accountId(authRequest));

    if (!state) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.send({ verification: state });
  });

  app.post('/account/verification/request', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = requestBodySchema.parse(request.body);
    const limit = requestLimit(authRequest, body.channel);

    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limit));
    }

    try {
      const result = await requestContactVerification({
        userId: accountId(authRequest),
        channel: body.channel,
        ipAddress: request.ip,
        pepper: env.VERIFICATION_CODE_PEPPER,
        provider: deliveryProvider
      });

      if (result.outcome === 'missing_contact') {
        return reply.code(409).send({ error: 'This contact method is not configured' });
      }
      if (result.outcome === 'already_verified') {
        return reply.code(409).send({
          error: 'This contact method is already verified',
          verifiedAt: result.verifiedAt
        });
      }
      if (result.outcome === 'rate_limited') {
        reply.header('Retry-After', String(result.retryAfterSeconds));
        return reply.code(429).send({
          error: 'Verification code requested too recently',
          retryAfterSeconds: result.retryAfterSeconds
        });
      }

      return reply.code(202).send({
        accepted: true,
        channel: body.channel,
        expiresAt: result.expiresAt,
        resendAfterSeconds: result.resendAfterSeconds
      });
    } catch (error) {
      if (error instanceof VerificationDeliveryError) {
        return reply.code(503).send({ error: 'Verification delivery is temporarily unavailable' });
      }
      throw error;
    }
  });

  app.post('/account/verification/confirm', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = confirmBodySchema.parse(request.body);
    const limit = confirmLimit(authRequest, body.channel);

    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limit));
    }

    const result = await confirmContactVerification({
      userId: accountId(authRequest),
      channel: body.channel,
      code: body.code,
      pepper: env.VERIFICATION_CODE_PEPPER,
      ipAddress: request.ip
    });

    if (result.outcome === 'missing_contact') {
      return reply.code(409).send({ error: 'This contact method is not configured' });
    }
    if (result.outcome === 'not_found') {
      return reply.code(409).send({ error: 'Request a verification code first' });
    }
    if (result.outcome === 'expired') {
      return reply.code(410).send({ error: 'Verification code expired' });
    }
    if (result.outcome === 'contact_changed') {
      return reply.code(409).send({ error: 'Contact details changed; request a new code' });
    }
    if (result.outcome === 'invalid_code') {
      return reply.code(400).send({
        error: 'Invalid verification code',
        attemptsRemaining: result.attemptsRemaining
      });
    }
    if (result.outcome === 'attempts_exhausted') {
      return reply.code(400).send({
        error: 'Verification attempts exhausted; request a new code',
        attemptsRemaining: 0
      });
    }

    return reply.send({
      verified: true,
      channel: body.channel,
      verifiedAt: result.verifiedAt,
      status: result.status
    });
  });
}
