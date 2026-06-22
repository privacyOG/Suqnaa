import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
const offerStatus = z.enum(['pending', 'accepted', 'rejected', 'expired', 'cancelled']);

const offerPageQuery = z.object({
  status: offerStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional()
});

const offerParams = z.object({
  offerId: z.string().uuid()
});

const sellerDecisionBody = z.object({
  status: z.enum(['accepted', 'rejected'])
});

class WorkflowError extends Error {
  constructor(
    readonly statusCode: 404 | 409,
    readonly payload: Record<string, unknown>
  ) {
    super(String(payload.error ?? 'Marketplace workflow error'));
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function enforceLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  accountLimit: number,
  ipLimit: number,
  windowMs = 5 * 60 * 1000
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

async function requireManagementChallenge(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string
): Promise<Awaited<ReturnType<typeof checkHumanProtectionWithChallenge>> | null> {
  const protection = await checkHumanProtectionWithChallenge(
    {
      action: 'offer.manage',
      accountId,
      ip: request.ip,
      userAgent: firstHeader(request.headers['user-agent']),
      challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
    },
    challengeVerifier
  );

  if (protection.decision === 'allow') {
    return protection;
  }

  reply.code(403).send(humanProtectionResponse(protection));
  return null;
}

async function attachedOrder(offerId: string) {
  const order = await db.selectFrom('transactions')
    .select([
      'id',
      'offer_id',
      'buyer_id',
      'seller_id',
      'listing_id',
      'amount',
      'currency_code',
      'status',
      'payment_method',
      'created_at',
      'updated_at'
    ])
    .where('offer_id', '=', offerId)
    .executeTakeFirst();

  return order
    ? {
        id: order.id,
        offerId: order.offer_id,
        buyerId: order.buyer_id,
        sellerId: order.seller_id,
        listingId: order.listing_id,
        amount: order.amount,
        currencyCode: order.currency_code,
        status: order.status,
        paymentMethod: order.payment_method,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }
    : null;
}

async function enrichOffer(
  offer: Record<string, any>,
  listing: Record<string, any>,
  counterpartId: string
) {
  const [counterpart, order] = await Promise.all([
    db.selectFrom('users')
      .select(['id', 'display_name', 'status'])
      .where('id', '=', counterpartId)
      .executeTakeFirst(),
    attachedOrder(offer.id)
  ]);

  return {
    id: offer.id,
    listingId: offer.listing_id,
    buyerId: offer.buyer_id,
    amount: offer.amount,
    currencyCode: offer.currency_code,
    status: offer.status,
    message: offer.message,
    createdAt: offer.created_at,
    updatedAt: offer.updated_at,
    listing: {
      id: listing.id,
      title: listing.title,
      status: listing.status,
      priceAmount: listing.price_amount,
      currencyCode: listing.currency_code
    },
    counterpart: counterpart
      ? {
          id: counterpart.id,
          displayName: counterpart.display_name,
          status: counterpart.status
        }
      : null,
    order
  };
}

export async function offerWorkflowRoutes(app: FastifyInstance): Promise<void> {
  app.get('/market/offers/incoming', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const sellerId = authRequest.user.sub;
    const query = offerPageQuery.parse(request.query);

    if (!enforceLimit(request, reply, sellerId, 'market.offers.incoming', 120, 300)) {
      return;
    }

    const sellerListings = await db.selectFrom('listings')
      .select(['id', 'title', 'status', 'price_amount', 'currency_code'])
      .where('seller_id', '=', sellerId)
      .execute();

    if (sellerListings.length === 0) {
      return reply.send({
        offers: [],
        pagination: { hasMore: false, nextCursor: null }
      });
    }

    const listingById = new Map(sellerListings.map((listing) => [listing.id, listing]));
    let offersQuery = db.selectFrom('offers')
      .select([
        'id',
        'listing_id',
        'buyer_id',
        'amount',
        'currency_code',
        'status',
        'message',
        'created_at',
        'updated_at'
      ])
      .where('listing_id', 'in', sellerListings.map((listing) => listing.id));

    if (query.status) {
      offersQuery = offersQuery.where('status', '=', query.status);
    }
    if (query.before) {
      offersQuery = offersQuery.where('updated_at', '<', new Date(query.before));
    }

    const rows = await offersQuery
      .orderBy('updated_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const offers = await Promise.all(page.map((offer) => {
      const listing = listingById.get(offer.listing_id);
      if (!listing) {
        throw new Error('Offer listing is unavailable');
      }
      return enrichOffer(offer, listing, offer.buyer_id);
    }));
    const last = page.at(-1);

    return reply.send({
      offers,
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.updated_at).toISOString()
          : null
      }
    });
  });

  app.get('/market/offers/mine', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const buyerId = authRequest.user.sub;
    const query = offerPageQuery.parse(request.query);

    if (!enforceLimit(request, reply, buyerId, 'market.offers.mine', 120, 300)) {
      return;
    }

    let offersQuery = db.selectFrom('offers')
      .select([
        'id',
        'listing_id',
        'buyer_id',
        'amount',
        'currency_code',
        'status',
        'message',
        'created_at',
        'updated_at'
      ])
      .where('buyer_id', '=', buyerId);

    if (query.status) {
      offersQuery = offersQuery.where('status', '=', query.status);
    }
    if (query.before) {
      offersQuery = offersQuery.where('updated_at', '<', new Date(query.before));
    }

    const rows = await offersQuery
      .orderBy('updated_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const offers = await Promise.all(page.map(async (offer) => {
      const listing = await db.selectFrom('listings')
        .select(['id', 'seller_id', 'title', 'status', 'price_amount', 'currency_code'])
        .where('id', '=', offer.listing_id)
        .executeTakeFirst();
      if (!listing) {
        throw new Error('Offer listing is unavailable');
      }
      return enrichOffer(offer, listing, listing.seller_id);
    }));
    const last = page.at(-1);

    return reply.send({
      offers,
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.updated_at).toISOString()
          : null
      }
    });
  });

  app.post('/market/offers/:offerId/status', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const sellerId = authRequest.user.sub;
    const params = offerParams.parse(request.params);
    const body = sellerDecisionBody.parse(request.body);

    if (!enforceLimit(request, reply, sellerId, 'market.offers.manage', 60, 180, 60 * 60 * 1000)) {
      return;
    }

    const protection = await requireManagementChallenge(request, reply, sellerId);
    if (!protection) {
      return;
    }

    try {
      const result = await db.transaction().execute(async (transaction) => {
        const offer = await transaction.selectFrom('offers')
          .select([
            'id',
            'listing_id',
            'buyer_id',
            'status',
            'amount',
            'currency_code',
            'updated_at'
          ])
          .where('id', '=', params.offerId)
          .executeTakeFirst();
        if (!offer) {
          throw new WorkflowError(404, { error: 'Offer not found' });
        }

        const listing = await transaction.selectFrom('listings')
          .select(['id', 'seller_id', 'status'])
          .where('id', '=', offer.listing_id)
          .executeTakeFirst();
        if (!listing || listing.seller_id !== sellerId) {
          throw new WorkflowError(404, { error: 'Offer not found' });
        }

        if (offer.status === body.status) {
          return { offer, unchanged: true };
        }
        if (offer.status !== 'pending') {
          throw new WorkflowError(409, {
            error: 'Offer is no longer pending',
            currentStatus: offer.status
          });
        }

        const now = new Date();
        if (body.status === 'accepted') {
          const reserved = await transaction.updateTable('listings')
            .set({ status: 'reserved', updated_at: now })
            .where('id', '=', listing.id)
            .where('status', '=', 'active')
            .returning(['id'])
            .executeTakeFirst();
          if (!reserved) {
            throw new WorkflowError(409, {
              error: 'Listing is no longer available',
              listingStatus: listing.status
            });
          }

          const accepted = await transaction.updateTable('offers')
            .set({ status: 'accepted', updated_at: now })
            .where('id', '=', offer.id)
            .where('status', '=', 'pending')
            .returning(['id', 'listing_id', 'buyer_id', 'status', 'amount', 'currency_code', 'updated_at'])
            .executeTakeFirst();
          if (!accepted) {
            throw new WorkflowError(409, { error: 'Offer changed; refresh and try again' });
          }

          await transaction.updateTable('offers')
            .set({ status: 'rejected', updated_at: now })
            .where('listing_id', '=', listing.id)
            .where('id', '!=', offer.id)
            .where('status', '=', 'pending')
            .execute();

          return { offer: accepted, unchanged: false };
        }

        const rejected = await transaction.updateTable('offers')
          .set({ status: 'rejected', updated_at: now })
          .where('id', '=', offer.id)
          .where('status', '=', 'pending')
          .returning(['id', 'listing_id', 'buyer_id', 'status', 'amount', 'currency_code', 'updated_at'])
          .executeTakeFirst();
        if (!rejected) {
          throw new WorkflowError(409, { error: 'Offer changed; refresh and try again' });
        }
        return { offer: rejected, unchanged: false };
      });

      writeSecurityAudit(app.log, {
        action: 'offer.manage',
        decision: 'allow',
        actorId: sellerId,
        targetId: params.offerId,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes,
        metadata: { status: body.status, unchanged: result.unchanged }
      });

      return reply.send({
        offer: {
          id: result.offer.id,
          listingId: result.offer.listing_id,
          buyerId: result.offer.buyer_id,
          amount: result.offer.amount,
          currencyCode: result.offer.currency_code,
          status: result.offer.status,
          updatedAt: result.offer.updated_at ?? null,
          unchanged: result.unchanged
        }
      });
    } catch (error) {
      if (error instanceof WorkflowError) {
        return reply.code(error.statusCode).send(error.payload);
      }
      throw error;
    }
  });

  app.post('/market/offers/:offerId/cancel', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const buyerId = authRequest.user.sub;
    const params = offerParams.parse(request.params);

    if (!enforceLimit(request, reply, buyerId, 'market.offers.cancel', 30, 100, 60 * 60 * 1000)) {
      return;
    }

    const protection = await requireManagementChallenge(request, reply, buyerId);
    if (!protection) {
      return;
    }

    const existing = await db.selectFrom('offers')
      .select(['id', 'listing_id', 'buyer_id', 'status'])
      .where('id', '=', params.offerId)
      .executeTakeFirst();
    if (!existing || existing.buyer_id !== buyerId) {
      return reply.code(404).send({ error: 'Offer not found' });
    }
    if (existing.status === 'cancelled') {
      return reply.send({
        offer: { id: existing.id, status: existing.status, unchanged: true }
      });
    }
    if (existing.status !== 'pending') {
      return reply.code(409).send({
        error: 'Only pending offers can be cancelled',
        currentStatus: existing.status
      });
    }

    const updated = await db.updateTable('offers')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('id', '=', existing.id)
      .where('buyer_id', '=', buyerId)
      .where('status', '=', 'pending')
      .returning(['id', 'listing_id', 'status', 'updated_at'])
      .executeTakeFirst();
    if (!updated) {
      return reply.code(409).send({ error: 'Offer changed; refresh and try again' });
    }

    writeSecurityAudit(app.log, {
      action: 'offer.manage',
      decision: 'allow',
      actorId: buyerId,
      targetId: existing.id,
      ip: request.ip,
      riskScore: protection.riskScore,
      reasonCodes: protection.reasonCodes,
      metadata: { status: 'cancelled' }
    });

    return reply.send({
      offer: {
        id: updated.id,
        listingId: updated.listing_id,
        status: updated.status,
        updatedAt: updated.updated_at,
        unchanged: false
      }
    });
  });
}
