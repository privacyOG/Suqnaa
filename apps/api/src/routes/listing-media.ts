import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { getListingMediaStorage } from '../media/listing-media-storage.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();

const listingMediaParams = z.object({
  listingId: z.string().uuid(),
  mediaId: z.string().uuid()
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function limitedListingMediaDelete(request: FastifyRequest, accountId: string) {
  const accountLimit = checkRateLimit({
    group: 'listing.media_delete.account',
    identifiers: [`account:${accountId}`],
    limit: 80,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: 'listing.media_delete.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 160,
    windowMs: 60 * 60 * 1000
  });

  return !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;
}

async function countListingMedia(listingId: string): Promise<number> {
  const row = await db.selectFrom('listing_media')
    .select((expression) => expression.fn.countAll<number>().as('count'))
    .where('listing_id', '=', listingId)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

export async function listingMediaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/listings/:listingId/media/:mediaId/delete', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = listingMediaParams.parse(request.params);
    const limited = limitedListingMediaDelete(request, authRequest.user.sub);

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const media = await db.selectFrom('listing_media')
      .innerJoin('listings', 'listings.id', 'listing_media.listing_id')
      .select([
        'listing_media.id as id',
        'listing_media.object_key as object_key',
        'listings.seller_id as seller_id',
        'listings.status as listing_status'
      ])
      .where('listing_media.id', '=', params.mediaId)
      .where('listing_media.listing_id', '=', params.listingId)
      .executeTakeFirst();

    if (!media || media.seller_id !== authRequest.user.sub) {
      return reply.code(404).send({ error: 'Media not found' });
    }
    if (media.listing_status === 'sold' || media.listing_status === 'removed') {
      return reply.code(409).send({ error: 'Listing is closed for media changes' });
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'listing.media_delete',
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

    const storage = getListingMediaStorage();

    try {
      await storage.remove(String(media.object_key));
    } catch (error) {
      request.log.warn({ error }, 'listing media storage deletion failed');
      return reply.code(503).send({ error: 'Media storage unavailable' });
    }

    const deleted = await db.deleteFrom('listing_media')
      .where('id', '=', params.mediaId)
      .where('listing_id', '=', params.listingId)
      .returning(['id'])
      .executeTakeFirst();

    if (!deleted) {
      return reply.code(404).send({ error: 'Media not found' });
    }

    await db.updateTable('listings')
      .set({ updated_at: new Date() })
      .where('id', '=', params.listingId)
      .where('seller_id', '=', authRequest.user.sub)
      .execute();

    const mediaCount = await countListingMedia(params.listingId);

    writeSecurityAudit(app.log, {
      action: 'listing.media_delete',
      decision: 'allow',
      actorId: authRequest.user.sub,
      targetId: params.listingId,
      ip: request.ip,
      riskScore: protection.riskScore,
      reasonCodes: protection.reasonCodes,
      metadata: {
        mediaId: deleted.id,
        storageDriver: storage.driver,
        mediaCount
      }
    });

    return reply.send({
      deleted: true,
      mediaId: deleted.id,
      mediaCount
    });
  });
}
