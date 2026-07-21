import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { getListingMediaStorage } from '../media/listing-media-storage.js';
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

function enforceOwnerMediaReadLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  accountLimitValue: number,
  ipLimitValue: number
): boolean {
  const accountLimit = checkRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit: accountLimitValue,
    windowMs: 5 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: ipLimitValue,
    windowMs: 5 * 60 * 1000
  });
  const limited = !accountLimit.allowed
    ? accountLimit
    : !ipLimit.allowed
      ? ipLimit
      : undefined;

  if (!limited) {
    return true;
  }

  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

async function countListingMedia(listingId: string): Promise<number> {
  const row = await db.selectFrom('listing_media')
    .select((expression) => expression.fn.countAll<number>().as('count'))
    .where('listing_id', '=', listingId)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

function ownerMediaUrl(listingId: string, mediaId: string): string {
  return `/v1/listings/${listingId}/media/${mediaId}/mine`;
}

function ownerMediaSummary(media: Record<string, unknown>) {
  const listingId = String(media.listing_id);
  const id = String(media.id);
  return {
    id,
    url: ownerMediaUrl(listingId, id),
    mimeType: media.mime_type,
    width: media.width,
    height: media.height,
    sizeBytes: media.size_bytes,
    sortOrder: media.sort_order,
    altText: media.alt_text ?? null,
    createdAt: media.created_at
  };
}

export async function listingMediaRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/listings/:listingId/media/mine',
    { preHandler: requireUser },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const params = listingParams.parse(request.params);

      if (!enforceOwnerMediaReadLimit(
        request,
        reply,
        authRequest.user.sub,
        'listing.media_mine',
        120,
        300
      )) {
        return;
      }

      const listing = await db.selectFrom('listings')
        .select(['id', 'title', 'seller_id', 'status'])
        .where('id', '=', params.listingId)
        .executeTakeFirst();

      if (!listing || listing.seller_id !== authRequest.user.sub) {
        return reply.code(404).send({ error: 'Listing not found' });
      }

      const media = await db.selectFrom('listing_media')
        .select([
          'id',
          'listing_id',
          'mime_type',
          'width',
          'height',
          'size_bytes',
          'sort_order',
          'alt_text',
          'created_at'
        ])
        .where('listing_id', '=', listing.id)
        .orderBy('sort_order', 'asc')
        .orderBy('created_at', 'asc')
        .limit(8)
        .execute();

      return reply.send({
        listing: {
          id: listing.id,
          title: listing.title,
          status: listing.status
        },
        media: media.map((item) => ownerMediaSummary(item)),
        mediaCount: media.length
      });
    }
  );

  app.get(
    '/listings/:listingId/media/:mediaId/mine',
    { preHandler: requireUser },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const params = listingMediaParams.parse(request.params);

      if (!enforceOwnerMediaReadLimit(
        request,
        reply,
        authRequest.user.sub,
        'listing.media_owner_delivery',
        600,
        1200
      )) {
        return;
      }

      const media = await db.selectFrom('listing_media')
        .innerJoin('listings', 'listings.id', 'listing_media.listing_id')
        .select([
          'listing_media.object_key as object_key',
          'listing_media.mime_type as mime_type',
          'listings.seller_id as seller_id'
        ])
        .where('listing_media.id', '=', params.mediaId)
        .where('listing_media.listing_id', '=', params.listingId)
        .executeTakeFirst();

      if (!media || media.seller_id !== authRequest.user.sub) {
        return reply.code(404).send({ error: 'Media not found' });
      }

      let delivery;
      try {
        delivery = await getListingMediaStorage().deliver(
          String(media.object_key),
          String(media.mime_type)
        );
      } catch (error) {
        request.log.warn({ error }, 'owner listing media delivery failed');
        return reply.code(404).send({ error: 'Media not found' });
      }

      reply.header('Cache-Control', 'private, max-age=60');
      reply.header('X-Content-Type-Options', 'nosniff');

      if (delivery.type === 'redirect') {
        reply.header('Location', delivery.url);
        return reply.code(302).send();
      }

      reply.header('Content-Type', delivery.mimeType);
      reply.header('Content-Length', String(delivery.buffer.length));
      return reply.send(delivery.buffer);
    }
  );

  app.post(
    '/listings/:listingId/media/:mediaId/delete',
    { preHandler: requireUser },
    async (request, reply) => {
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
    }
  );
}
