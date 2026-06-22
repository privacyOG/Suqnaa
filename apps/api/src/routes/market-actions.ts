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
  offerId: z.string().uuid(),
  paymentMethod: z.enum(['card', 'bank_transfer', 'wallet', 'xmr']),
  clientOrderId: z.string().uuid()
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

class MarketActionError extends Error {
  constructor(
    readonly statusCode: 404 | 409,
    readonly payload: Record<string, unknown>
  ) {
    super(String(payload.error ?? 'Marketplace action failed'));
  }
}

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

function orderResponse(order: Record<string, unknown>, idempotent: boolean) {
  return {
    accepted: true,
    idempotent,
    order: {
      id: order.id,
      offerId: order.offer_id,
      listingId: order.listing_id,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      amount: order.amount,
      currencyCode: order.currency_code,
      status: order.status,
      paymentMethod: order.payment_method,
      clientOrderId: order.client_order_id,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    }
  };
}

const orderColumns = [
  'id',
  'offer_id',
  'listing_id',
  'buyer_id',
  'seller_id',
  'amount',
  'currency_code',
  'status',
  'payment_method',
  'client_order_id',
  'created_at',
  'updated_at'
] as const;

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
    const buyerId = authRequest.user.sub;
    const body = orderBody.parse(request.body);

    const idempotentOrder = await db.selectFrom('transactions')
      .select(orderColumns)
      .where('buyer_id', '=', buyerId)
      .where('client_order_id', '=', body.clientOrderId)
      .executeTakeFirst();
    if (idempotentOrder) {
      return reply.send(orderResponse(idempotentOrder, true));
    }

    if (!enforceActionLimit(request, reply, buyerId, 'market.orders', 30, 100, 60 * 60 * 1000)) {
      return;
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'order.create',
        accountId: buyerId,
        ip: request.ip,
        userAgent: firstHeader(request.headers['user-agent']),
        challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
      },
      challengeVerifier
    );
    if (protection.decision !== 'allow') {
      writeSecurityAudit(app.log, {
        action: 'order.create',
        decision: protection.decision,
        actorId: buyerId,
        targetId: body.offerId,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes
      });
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    try {
      const result = await db.transaction().execute(async (transaction) => {
        const offer = await transaction.selectFrom('offers')
          .select(['id', 'listing_id', 'buyer_id', 'amount', 'currency_code', 'status'])
          .where('id', '=', body.offerId)
          .executeTakeFirst();
        if (!offer || offer.buyer_id !== buyerId) {
          throw new MarketActionError(404, { error: 'Accepted offer not found' });
        }

        const existing = await transaction.selectFrom('transactions')
          .select(orderColumns)
          .where('offer_id', '=', offer.id)
          .executeTakeFirst();
        if (existing) {
          return { order: existing, idempotent: true };
        }

        if (offer.status !== 'accepted') {
          throw new MarketActionError(409, {
            error: 'Order requires an accepted offer',
            currentStatus: offer.status
          });
        }

        const listing = await transaction.selectFrom('listings')
          .select(['id', 'seller_id', 'status'])
          .where('id', '=', offer.listing_id)
          .executeTakeFirst();
        if (!listing) {
          throw new MarketActionError(404, { error: 'Listing not found' });
        }
        if (listing.status !== 'reserved') {
          throw new MarketActionError(409, {
            error: 'Listing is not reserved for this offer',
            listingStatus: listing.status
          });
        }

        const inserted = await transaction.insertInto('transactions')
          .values({
            listing_id: listing.id,
            offer_id: offer.id,
            buyer_id: buyerId,
            seller_id: listing.seller_id,
            amount: offer.amount,
            currency_code: offer.currency_code,
            status: 'pending',
            payment_method: body.paymentMethod,
            client_order_id: body.clientOrderId,
            payment_provider: null,
            payment_reference: null,
            updated_at: new Date()
          })
          .onConflict((conflict) => conflict.doNothing())
          .returning(orderColumns)
          .executeTakeFirst();

        if (inserted) {
          return { order: inserted, idempotent: false };
        }

        const raced = await transaction.selectFrom('transactions')
          .select(orderColumns)
          .where((expression) => expression.or([
            expression('offer_id', '=', offer.id),
            expression('client_order_id', '=', body.clientOrderId)
          ]))
          .executeTakeFirst();
        if (!raced || raced.buyer_id !== buyerId) {
          throw new MarketActionError(409, { error: 'Order changed; refresh and try again' });
        }
        return { order: raced, idempotent: true };
      });

      writeSecurityAudit(app.log, {
        action: 'order.create',
        decision: 'allow',
        actorId: buyerId,
        targetId: result.order.id,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes,
        metadata: {
          offerId: result.order.offer_id,
          listingId: result.order.listing_id,
          paymentMethod: result.order.payment_method,
          idempotent: result.idempotent
        }
      });

      return reply
        .code(result.idempotent ? 200 : 201)
        .send(orderResponse(result.order, result.idempotent));
    } catch (error) {
      if (error instanceof MarketActionError) {
        return reply.code(error.statusCode).send(error.payload);
      }
      throw error;
    }
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
