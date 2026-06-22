import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import {
  checkHumanProtection,
  checkHumanProtectionWithChallenge,
  humanProtectionResponse
} from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();

const timedSaleBody = z.object({
  listingId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  openingAmount: z.number().nonnegative(),
  minimumStep: z.number().positive().default(1)
});

const offerBody = z.object({
  listingId: z.string().uuid(),
  amount: z.number().positive(),
  currencyCode: z.string().length(3),
  message: z.string().trim().max(500).optional(),
  clientOfferId: z.string().uuid()
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

function offerResponse(offer: Record<string, unknown>, idempotent: boolean) {
  return {
    accepted: true,
    idempotent,
    offer: {
      id: offer.id,
      listingId: offer.listing_id,
      buyerId: offer.buyer_id,
      amount: offer.amount,
      currencyCode: offer.currency_code,
      status: offer.status,
      message: offer.message,
      clientOfferId: offer.client_offer_id,
      createdAt: offer.created_at,
      updatedAt: offer.updated_at
    }
  };
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
    const buyerId = authRequest.user.sub;
    const body = offerBody.parse(request.body);
    const normalizedCurrency = body.currencyCode.toUpperCase();

    const idempotentOffer = await db.selectFrom('offers')
      .select([
        'id',
        'listing_id',
        'buyer_id',
        'amount',
        'currency_code',
        'status',
        'message',
        'client_offer_id',
        'created_at',
        'updated_at'
      ])
      .where('buyer_id', '=', buyerId)
      .where('client_offer_id', '=', body.clientOfferId)
      .executeTakeFirst();

    if (idempotentOffer) {
      return reply.send(offerResponse(idempotentOffer, true));
    }

    if (!enforceActionLimit(request, reply, buyerId, 'market.offers', 60, 180, 15 * 60 * 1000)) {
      return;
    }

    const pairLimit = checkRateLimit({
      group: 'market.offers.listing_buyer',
      identifiers: [`listing:${body.listingId}:buyer:${buyerId}`],
      limit: 10,
      windowMs: 24 * 60 * 60 * 1000
    });
    if (!pairLimit.allowed) {
      reply.header('Retry-After', String(pairLimit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(pairLimit));
    }

    const listing = await db.selectFrom('listings')
      .select(['id', 'seller_id', 'status', 'price_amount', 'currency_code'])
      .where('id', '=', body.listingId)
      .executeTakeFirst();

    if (!listing || listing.status !== 'active') {
      return reply.code(404).send({ error: 'Listing not found' });
    }
    if (listing.seller_id === buyerId) {
      return reply.code(400).send({ error: 'You cannot make an offer on your own listing' });
    }
    if (String(listing.currency_code).toUpperCase() !== normalizedCurrency) {
      return reply.code(400).send({ error: 'Offer currency must match the listing currency' });
    }

    const askingAmount = Number(listing.price_amount);
    if (!Number.isFinite(askingAmount) || body.amount > askingAmount) {
      return reply.code(400).send({ error: 'Offer amount cannot exceed the asking price' });
    }

    const pendingOffer = await db.selectFrom('offers')
      .select(['id', 'amount', 'currency_code', 'created_at'])
      .where('listing_id', '=', listing.id)
      .where('buyer_id', '=', buyerId)
      .where('status', '=', 'pending')
      .executeTakeFirst();

    if (pendingOffer) {
      return reply.code(409).send({
        error: 'A pending offer already exists for this listing',
        offer: {
          id: pendingOffer.id,
          amount: pendingOffer.amount,
          currencyCode: pendingOffer.currency_code,
          createdAt: pendingOffer.created_at
        }
      });
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'offer.create',
        accountId: buyerId,
        ip: request.ip,
        userAgent: firstHeader(request.headers['user-agent']),
        challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
      },
      challengeVerifier
    );

    if (protection.decision !== 'allow') {
      writeSecurityAudit(app.log, {
        action: 'offer.create',
        decision: protection.decision,
        actorId: buyerId,
        targetId: listing.id,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes
      });
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    const inserted = await db.insertInto('offers')
      .values({
        listing_id: listing.id,
        buyer_id: buyerId,
        amount: body.amount.toFixed(2),
        currency_code: normalizedCurrency,
        status: 'pending',
        message: body.message || null,
        client_offer_id: body.clientOfferId,
        updated_at: new Date()
      })
      .onConflict((conflict) => conflict.doNothing())
      .returning([
        'id',
        'listing_id',
        'buyer_id',
        'amount',
        'currency_code',
        'status',
        'message',
        'client_offer_id',
        'created_at',
        'updated_at'
      ])
      .executeTakeFirst();

    if (!inserted) {
      const racedOffer = await db.selectFrom('offers')
        .select([
          'id',
          'listing_id',
          'buyer_id',
          'amount',
          'currency_code',
          'status',
          'message',
          'client_offer_id',
          'created_at',
          'updated_at'
        ])
        .where('buyer_id', '=', buyerId)
        .where('client_offer_id', '=', body.clientOfferId)
        .executeTakeFirst();

      if (racedOffer) {
        return reply.send(offerResponse(racedOffer, true));
      }
      return reply.code(409).send({ error: 'A pending offer already exists for this listing' });
    }

    writeSecurityAudit(app.log, {
      action: 'offer.create',
      decision: 'allow',
      actorId: buyerId,
      targetId: listing.id,
      ip: request.ip,
      riskScore: protection.riskScore,
      reasonCodes: protection.reasonCodes,
      metadata: {
        offerId: inserted.id,
        amount: inserted.amount,
        currencyCode: inserted.currency_code
      }
    });

    return reply.code(201).send(offerResponse(inserted, false));
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
