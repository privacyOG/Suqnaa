import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  ListingEditError,
  readSellerListingForEdit,
  updateSellerListing
} from '../listings/listing-edit-service.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();

const listingParams = z.object({
  listingId: z.string().uuid()
});

const listingEditBody = z.object({
  version: z.number().int().min(1),
  categoryId: z.string().uuid().nullable(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  priceAmount: z.number().finite().nonnegative(),
  currencyCode: z.string().trim().length(3),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts_or_repair']),
  availabilityStatus: z.enum(['in_stock', 'limited', 'out_of_stock', 'service_available']),
  availableQuantity: z.number().int().min(0).max(1000000).nullable(),
  unitLabel: z.string().trim().min(1).max(40).nullable(),
  countryCode: z.string().trim().length(2),
  region: z.string().trim().min(1).max(120).nullable(),
  city: z.string().trim().min(1).max(120).nullable(),
  suburb: z.string().trim().min(1).max(120).nullable(),
  allowPickup: z.boolean(),
  allowDelivery: z.boolean()
}).strict().superRefine((value, context) => {
  if (!value.allowPickup && !value.allowDelivery) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['allowPickup'],
      message: 'At least one fulfilment option is required'
    });
  }
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function limited(
  request: FastifyRequest,
  accountId: string,
  group: string,
  accountLimit: number,
  ipLimit: number,
  windowMs: number
) {
  const account = checkRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit: accountLimit,
    windowMs
  });
  const ip = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: ipLimit,
    windowMs
  });
  return !account.allowed ? account : !ip.allowed ? ip : undefined;
}

function sendListingEditError(reply: FastifyReply, error: ListingEditError) {
  return reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...(error.currentVersion !== undefined ? { currentVersion: error.currentVersion } : {}),
    ...(error.currentStatus !== undefined ? { currentStatus: error.currentStatus } : {})
  });
}

export async function listingEditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings/:listingId/manage', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = listingParams.parse(request.params);
    const rate = limited(
      request,
      authRequest.user.sub,
      'listing.edit.read',
      120,
      300,
      5 * 60 * 1000
    );
    if (rate) {
      reply.header('Retry-After', String(rate.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(rate));
    }

    try {
      return reply.send(await readSellerListingForEdit(authRequest.user.sub, params.listingId));
    } catch (error) {
      if (error instanceof ListingEditError) {
        return sendListingEditError(reply, error);
      }
      throw error;
    }
  });

  app.post('/listings/:listingId/edit', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = listingParams.parse(request.params);
    const body = listingEditBody.parse(request.body);
    const rate = limited(
      request,
      authRequest.user.sub,
      'listing.edit.write',
      40,
      120,
      60 * 60 * 1000
    );
    if (rate) {
      reply.header('Retry-After', String(rate.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(rate));
    }

    try {
      const snapshot = await readSellerListingForEdit(authRequest.user.sub, params.listingId);
      if (!snapshot.editable) {
        throw new ListingEditError(
          'listing_not_editable',
          409,
          'Listing cannot be edited in its current status',
          snapshot.listing.version,
          snapshot.listing.status
        );
      }
      if (snapshot.listing.version !== body.version) {
        throw new ListingEditError(
          'listing_conflict',
          409,
          'Listing changed; reload before saving',
          snapshot.listing.version,
          snapshot.listing.status
        );
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

      const result = await updateSellerListing({
        userId: authRequest.user.sub,
        listingId: params.listingId,
        edit: body
      });

      writeSecurityAudit(app.log, {
        action: 'listing.edit',
        decision: 'allow',
        actorId: authRequest.user.sub,
        targetId: params.listingId,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes,
        metadata: {
          submittedVersion: body.version,
          resultingVersion: result.listing.version,
          status: result.listing.status,
          unchanged: result.unchanged
        }
      });

      return reply.send(result);
    } catch (error) {
      if (error instanceof ListingEditError) {
        return sendListingEditError(reply, error);
      }
      throw error;
    }
  });
}
