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

const listingParams = z.object({
  listingId: z.string().uuid()
});

const editableStatuses = new Set(['draft', 'active', 'expired']);

const updateListingBody = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  priceAmount: z.number().nonnegative().optional(),
  currencyCode: z.string().length(3).optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts_or_repair']).optional(),
  countryCode: z.string().length(2).optional(),
  region: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  suburb: z.string().trim().max(120).nullable().optional(),
  allowPickup: z.boolean().optional(),
  allowDelivery: z.boolean().optional()
}).refine(
  (value) => Object.values(value).some((entry) => entry !== undefined),
  'At least one field is required'
);

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function sellerListingManagementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/listings/:listingId/edit', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = listingParams.parse(request.params);
    const body = updateListingBody.parse(request.body);

    const accountLimit = checkRateLimit({
      group: 'listing.edit.account',
      identifiers: [`account:${authRequest.user.sub}`],
      limit: 40,
      windowMs: 60 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'listing.edit.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 120,
      windowMs: 60 * 60 * 1000
    });
    const limited = !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;

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

    if (!editableStatuses.has(existing.status)) {
      return reply.code(409).send({
        error: 'Listing cannot be edited in its current status',
        currentStatus: existing.status
      });
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'listing.edit',
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

    const values: Record<string, unknown> = {
      updated_at: new Date()
    };

    if (body.title !== undefined) values.title = body.title;
    if (body.description !== undefined) values.description = body.description;
    if (body.priceAmount !== undefined) values.price_amount = body.priceAmount.toFixed(2);
    if (body.currencyCode !== undefined) values.currency_code = body.currencyCode.toUpperCase();
    if (body.condition !== undefined) values.condition = body.condition;
    if (body.countryCode !== undefined) values.country_code = body.countryCode.toUpperCase();
    if (body.region !== undefined) values.region = body.region;
    if (body.city !== undefined) values.city = body.city;
    if (body.suburb !== undefined) values.suburb = body.suburb;
    if (body.allowPickup !== undefined) values.allow_pickup = body.allowPickup;
    if (body.allowDelivery !== undefined) values.allow_delivery = body.allowDelivery;

    const updated = await db.updateTable('listings')
      .set(values)
      .where('id', '=', existing.id)
      .where('seller_id', '=', authRequest.user.sub)
      .where('status', '=', existing.status)
      .returning([
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
        'updated_at'
      ])
      .executeTakeFirst();

    if (!updated) {
      return reply.code(409).send({ error: 'Listing changed; refresh and try again' });
    }

    writeSecurityAudit(app.log, {
      action: 'listing.edit',
      decision: 'allow',
      actorId: authRequest.user.sub,
      targetId: existing.id,
      ip: request.ip,
      riskScore: protection.riskScore,
      reasonCodes: protection.reasonCodes,
      metadata: {
        changedFields: Object.keys(body).length,
        status: existing.status
      }
    });

    return reply.send({
      listing: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        priceAmount: updated.price_amount,
        currencyCode: updated.currency_code,
        condition: updated.condition,
        status: updated.status,
        countryCode: updated.country_code,
        region: updated.region,
        city: updated.city,
        suburb: updated.suburb,
        allowPickup: updated.allow_pickup,
        allowDelivery: updated.allow_delivery,
        updatedAt: updated.updated_at
      }
    });
  });
}
