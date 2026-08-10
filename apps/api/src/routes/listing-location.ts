import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  ListingLocationError,
  readSellerListingLocation,
  updateSellerListingLocation
} from '../listings/listing-location-service.js';
import { approximateListingLocationInput } from '../listings/listing-location.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

const challengeVerifier = new NoopChallengeVerifier();
const listingParams = z.object({ listingId: z.string().uuid() });
const listingLocationBody = z.object({
  version: z.number().int().min(1),
  approximateLocation: approximateListingLocationInput.nullable()
}).strict();

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function limited(
  request: FastifyRequest,
  accountId: string,
  group: string,
  accountLimit: number,
  ipLimit: number,
  windowMs: number
) {
  const account = await checkSharedRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit: accountLimit,
    windowMs
  });
  const ip = await checkSharedRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: ipLimit,
    windowMs
  });
  return !account.allowed ? account : !ip.allowed ? ip : undefined;
}

function sendLocationError(reply: FastifyReply, error: ListingLocationError) {
  return reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...(error.currentVersion !== undefined ? { currentVersion: error.currentVersion } : {}),
    ...(error.currentStatus !== undefined ? { currentStatus: error.currentStatus } : {})
  });
}

export async function listingLocationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings/:listingId/location/manage', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = listingParams.parse(request.params);
    const rate = await limited(request, authRequest.user.sub, 'listing.location.read', 120, 300, 5 * 60 * 1000);
    if (rate) {
      reply.header('Retry-After', String(rate.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(rate));
    }

    try {
      return reply.send({
        listing: await readSellerListingLocation(authRequest.user.sub, params.listingId)
      });
    } catch (error) {
      if (error instanceof ListingLocationError) return sendLocationError(reply, error);
      throw error;
    }
  });

  app.post('/listings/:listingId/location', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = listingParams.parse(request.params);
    const body = listingLocationBody.parse(request.body);
    const rate = await limited(request, authRequest.user.sub, 'listing.location.write', 40, 120, 60 * 60 * 1000);
    if (rate) {
      reply.header('Retry-After', String(rate.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(rate));
    }

    try {
      const current = await readSellerListingLocation(authRequest.user.sub, params.listingId);
      if (!current.editable) {
        throw new ListingLocationError(
          'listing_not_editable',
          409,
          'Listing location cannot be edited in its current status',
          current.version,
          current.status
        );
      }
      if (current.version !== body.version) {
        throw new ListingLocationError(
          'listing_conflict',
          409,
          'Listing changed; reload before saving location',
          current.version,
          current.status
        );
      }

      const protection = await checkHumanProtectionWithChallenge({
        action: 'listing.edit',
        accountId: authRequest.user.sub,
        ip: request.ip,
        userAgent: firstHeader(request.headers['user-agent']),
        challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
      }, challengeVerifier);
      if (protection.decision !== 'allow') {
        return reply.code(403).send(humanProtectionResponse(protection));
      }

      const result = await updateSellerListingLocation({
        userId: authRequest.user.sub,
        listingId: params.listingId,
        version: body.version,
        approximateLocation: body.approximateLocation
      });

      writeSecurityAudit(app.log, {
        action: 'listing.location_update',
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
          locationConfigured: result.listing.approximateLocation !== null,
          unchanged: result.unchanged
        }
      });

      return reply.send(result);
    } catch (error) {
      if (error instanceof ListingLocationError) return sendLocationError(reply, error);
      throw error;
    }
  });
}
