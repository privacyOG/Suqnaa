import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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

function enforceActionLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  accountLimit: number,
  ipLimit: number,
  windowMs: number
): boolean {
  const perAccount = checkRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit: accountLimit,
    windowMs
  });
  const perIp = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: ipLimit,
    windowMs
  });
  const limited = !perAccount.allowed ? perAccount : !perIp.allowed ? perIp : undefined;

  if (!limited) {
    return true;
  }

  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

function enforceHumanProtection(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  action: string
): boolean {
  const protection = checkHumanProtection({
    action,
    accountId,
    ip: request.ip,
    userAgent: firstHeader(request.headers['user-agent'])
  });

  if (protection.decision === 'allow') {
    return true;
  }

  reply.code(403).send(humanProtectionResponse(protection));
  return false;
}

export async function marketActionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/market/timed-sale', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = timedSaleBody.parse(request.body);

    if (!enforceActionLimit(request, reply, authRequest.user.sub, 'market.timed_sale', 10, 30, 24 * 60 * 60 * 1000)) {
      return;
    }
    if (!enforceHumanProtection(request, reply, authRequest.user.sub, 'timed_sale.create')) {
      return;
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/offers', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = offerBody.parse(request.body);

    if (!enforceActionLimit(request, reply, authRequest.user.sub, 'market.offers', 60, 180, 15 * 60 * 1000)) {
      return;
    }
    if (!enforceHumanProtection(request, reply, authRequest.user.sub, 'offer.create')) {
      return;
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/orders', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = orderBody.parse(request.body);

    if (body.counterpartyId === authRequest.user.sub) {
      return reply.code(400).send({ error: 'Counterparty must be different' });
    }
    if (!enforceActionLimit(request, reply, authRequest.user.sub, 'market.orders', 30, 100, 60 * 60 * 1000)) {
      return;
    }
    if (!enforceHumanProtection(request, reply, authRequest.user.sub, 'order.create')) {
      return;
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/reviews', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = reviewBody.parse(request.body);

    if (!enforceActionLimit(request, reply, authRequest.user.sub, 'market.reviews', 10, 30, 24 * 60 * 60 * 1000)) {
      return;
    }
    if (!enforceHumanProtection(request, reply, authRequest.user.sub, 'review.create')) {
      return;
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/identity-checks', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = identityBody.parse(request.body);

    if (!enforceActionLimit(request, reply, authRequest.user.sub, 'market.identity', 5, 20, 24 * 60 * 60 * 1000)) {
      return;
    }
    if (!enforceHumanProtection(request, reply, authRequest.user.sub, 'profile.check')) {
      return;
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });
}
