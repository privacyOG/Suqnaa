import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();

const listingStatus = z.enum(['draft', 'active', 'reserved', 'sold', 'expired', 'removed']);
type ListingStatus = z.infer<typeof listingStatus>;

const listingParams = z.object({
  listingId: z.string().uuid()
});

const listingStatusBody = z.object({
  status: listingStatus
});

const allowedStatusTransitions: Record<ListingStatus, ReadonlySet<ListingStatus>> = {
  draft: new Set<ListingStatus>(['active', 'removed']),
  active: new Set<ListingStatus>(['reserved', 'sold', 'removed']),
  reserved: new Set<ListingStatus>(['active', 'sold', 'removed']),
  sold: new Set<ListingStatus>(),
  expired: new Set<ListingStatus>(['active', 'removed']),
  removed: new Set<ListingStatus>()
};

const myListingsQuery = z.object({
  status: listingStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional()
});

const createListingBody = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  priceAmount: z.number().nonnegative(),
  currencyCode: z.string().length(3),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts_or_repair']),
  countryCode: z.string().length(2),
  region: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  suburb: z.string().max(120).optional(),
  allowPickup: z.boolean().default(true),
  allowDelivery: z.boolean().default(false)
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function limitedListingAction(request: FastifyRequest, accountId: string) {
  const accountLimit = checkRateLimit({
    group: 'listing.status.account',
    identifiers: [`account:${accountId}`],
    limit: 40,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: 'listing.status.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 120,
    windowMs: 60 * 60 * 1000
  });

  return !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;
}

export async function listingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings/mine', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const query = myListingsQuery.parse(request.query);
    const accountLimit = checkRateLimit({
      group: 'listing.mine.account',
      identifiers: [`account:${authRequest.user.sub}`],
      limit: 120,
      windowMs: 5 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'listing.mine.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 300,
      windowMs: 5 * 60 * 1000
    });
    const limited = !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    let listingsQuery = db.selectFrom('listings')
      .select([
        'id',
        'title',
        'description',
        'price_amount',
        'currency_code',
        'condition',
        'status',
        'country_code',
        'region',
        'city',
        'suburb',
        'allow_pickup',
        'allow_delivery',
        'created_at',
        'updated_at'
      ])
      .where('seller_id', '=', authRequest.user.sub);

    if (query.status) {
      listingsQuery = listingsQuery.where('status', '=', query.status);
    }
    if (query.before) {
      listingsQuery = listingsQuery.where('updated_at', '<', new Date(query.before));
    }

    const rows = await listingsQuery
      .orderBy('updated_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return reply.send({
      listings: page.map((listing) => ({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        priceAmount: listing.price_amount,
        currencyCode: listing.currency_code,
        condition: listing.condition,
        status: listing.status,
        countryCode: listing.country_code,
        region: listing.region,
        city: listing.city,
        suburb: listing.suburb,
        allowPickup: listing.allow_pickup,
        allowDelivery: listing.allow_delivery,
        createdAt: listing.created_at,
        updatedAt: listing.updated_at
      })),
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.updated_at).toISOString()
          : null
      }
    });
  });

  app.post('/listings/:listingId/status', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = listingParams.parse(request.params);
    const body = listingStatusBody.parse(request.body);
    const limited = limitedListingAction(request, authRequest.user.sub);

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const existing = await db.selectFrom('listings')
      .select(['id', 'seller_id', 'status'])
      .where('id', '=', params.listingId)
      .executeTakeFirst();

    if (!existing || existing.seller_id !== authRequest.user.sub) {
      return reply.code(404).send({ error: 'Listing not found' });
    }

    const currentStatus = listingStatus.parse(existing.status);
    if (currentStatus === body.status) {
      return reply.send({
        listing: {
          id: existing.id,
          status: currentStatus,
          unchanged: true
        }
      });
    }

    if (!allowedStatusTransitions[currentStatus].has(body.status)) {
      return reply.code(409).send({
        error: 'Invalid listing status transition',
        currentStatus,
        requestedStatus: body.status
      });
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'listing.status_update',
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

    const updated = await db.updateTable('listings')
      .set({
        status: body.status,
        updated_at: new Date()
      })
      .where('id', '=', existing.id)
      .where('seller_id', '=', authRequest.user.sub)
      .where('status', '=', currentStatus)
      .returning(['id', 'title', 'status', 'updated_at'])
      .executeTakeFirst();

    if (!updated) {
      return reply.code(409).send({ error: 'Listing changed; refresh and try again' });
    }

    writeSecurityAudit(app.log, {
      action: 'listing.status_update',
      decision: 'allow',
      actorId: authRequest.user.sub,
      targetId: existing.id,
      ip: request.ip,
      riskScore: protection.riskScore,
      reasonCodes: protection.reasonCodes,
      metadata: {
        fromStatus: currentStatus,
        toStatus: body.status
      }
    });

    return reply.send({
      listing: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        updatedAt: updated.updated_at,
        unchanged: false
      }
    });
  });

  app.get('/listings', async () => {
    const listings = await db.selectFrom('listings')
      .select(['id', 'title', 'price_amount', 'currency_code', 'condition', 'city', 'country_code', 'created_at'])
      .where('status', '=', 'active')
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();

    return { listings };
  });

  app.post('/listings', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = createListingBody.parse(request.body);

    const accountLimit = checkRateLimit({
      group: 'listing.create.account',
      identifiers: [`account:${authRequest.user.sub}`],
      limit: 20,
      windowMs: 60 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'listing.create.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 60,
      windowMs: 60 * 60 * 1000
    });
    const limited = !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'listing.create',
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

    const listing = await db.insertInto('listings')
      .values({
        seller_id: authRequest.user.sub,
        category_id: body.categoryId ?? null,
        title: body.title,
        description: body.description,
        price_amount: body.priceAmount.toFixed(2),
        currency_code: body.currencyCode.toUpperCase(),
        condition: body.condition,
        status: 'draft',
        country_code: body.countryCode.toUpperCase(),
        region: body.region ?? null,
        city: body.city ?? null,
        suburb: body.suburb ?? null,
        allow_pickup: body.allowPickup,
        allow_delivery: body.allowDelivery
      })
      .returning(['id', 'title', 'status', 'created_at'])
      .executeTakeFirstOrThrow();

    return reply.code(201).send({ listing });
  });
}
