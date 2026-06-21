import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { checkHumanProtection, humanProtectionResponse } from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const timedSaleBody = z.object({
  listingId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  openingAmount: z.number().nonnegative(),
  minimumStep: z.number().positive().default(1)
});

const offerBody = z.object({
  marketEventId: z.string().uuid(),
  amount: z.number().positive(),
  currencyCode: z.string().length(3)
});

const orderBody = z.object({
  counterpartyId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  marketEventId: z.string().uuid().optional(),
  amount: z.number().positive(),
  currencyCode: z.string().length(3),
  paymentMethod: z.enum(['card', 'bank_transfer', 'wallet', 'xmr'])
});

const reviewBody = z.object({
  paymentRecordId: z.string().uuid(),
  reason: z.string().trim().min(3).max(120),
  summary: z.string().trim().max(2000).optional()
});

const identityBody = z.object({
  level: z.enum(['basic', 'seller', 'high_value_seller', 'business']),
  countryCode: z.string().length(2)
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function marketActionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/market/timed-sale', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = timedSaleBody.parse(request.body);

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/offers', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = offerBody.parse(request.body);
    const accountLimit = checkRateLimit({
      group: 'market.offers.account',
      identifiers: [`account:${authRequest.user.sub}`],
      limit: 60,
      windowMs: 15 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'market.offers.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 180,
      windowMs: 15 * 60 * 1000
    });
    const limited = !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const protection = checkHumanProtection({
      action: 'offer.create',
      accountId: authRequest.user.sub,
      ip: request.ip,
      userAgent: firstHeader(request.headers['user-agent'])
    });

    if (protection.decision !== 'allow') {
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/orders', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = orderBody.parse(request.body);

    if (body.counterpartyId === authRequest.user.sub) {
      return reply.code(400).send({ error: 'Counterparty must be different' });
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/reviews', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = reviewBody.parse(request.body);

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/identity-checks', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = identityBody.parse(request.body);
    const accountLimit = checkRateLimit({
      group: 'market.identity.account',
      identifiers: [`account:${authRequest.user.sub}`],
      limit: 5,
      windowMs: 24 * 60 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'market.identity.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 20,
      windowMs: 24 * 60 * 60 * 1000
    });
    const limited = !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const protection = checkHumanProtection({
      action: 'profile.check',
      accountId: authRequest.user.sub,
      ip: request.ip,
      userAgent: firstHeader(request.headers['user-agent'])
    });

    if (protection.decision !== 'allow') {
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });
}
