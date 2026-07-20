import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import {
  detectListingImageMime,
  extensionForListingImage,
  maximumListingImageBytes,
  maximumListingMediaItems,
  normalizeListingImageMime,
  supportedListingImageMimeTypes
} from '../media/listing-media-upload.js';
import { getListingMediaStorage } from '../media/listing-media-storage.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();

const listingParams = z.object({
  listingId: z.string().uuid()
});

const uploadQuery = z.object({
  width: z.coerce.number().int().min(1).max(12000).optional(),
  height: z.coerce.number().int().min(1).max(12000).optional(),
  altText: z.string().trim().max(180).optional(),
  sortOrder: z.coerce.number().int().min(0).max(100).optional()
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function limitedListingMediaUpload(request: FastifyRequest, accountId: string) {
  const accountLimit = checkRateLimit({
    group: 'listing.media_binary.account',
    identifiers: [`account:${accountId}`],
    limit: 80,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: 'listing.media_binary.ip',
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

function mediaPublicUrl(listingId: string, mediaId: string): string {
  return `/v1/listings/${listingId}/media/${mediaId}`;
}

function mediaSummary(media: Record<string, unknown>) {
  const listingId = String(media.listing_id);
  const id = String(media.id);

  return {
    id,
    url: mediaPublicUrl(listingId, id),
    mimeType: media.mime_type,
    width: media.width,
    height: media.height,
    sizeBytes: media.size_bytes,
    sortOrder: media.sort_order,
    altText: media.alt_text ?? null,
    createdAt: media.created_at
  };
}

export async function listingMediaUploadRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    [...supportedListingImageMimeTypes],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  );

  app.post(
    '/listings/:listingId/media/upload',
    {
      preHandler: requireUser,
      bodyLimit: maximumListingImageBytes
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const params = listingParams.parse(request.params);
      const query = uploadQuery.parse(request.query);
      const limited = limitedListingMediaUpload(request, authRequest.user.sub);

      if (limited) {
        reply.header('Retry-After', String(limited.retryAfterSeconds));
        return reply.code(429).send(rateLimitResponse(limited));
      }

      const listing = await db.selectFrom('listings')
        .select(['id', 'seller_id', 'status'])
        .where('id', '=', params.listingId)
        .executeTakeFirst();

      if (!listing || listing.seller_id !== authRequest.user.sub) {
        return reply.code(404).send({ error: 'Listing not found' });
      }
      if (listing.status === 'sold' || listing.status === 'removed') {
        return reply.code(409).send({ error: 'Listing is closed for media changes' });
      }

      const existingCount = await countListingMedia(listing.id);
      if (existingCount >= maximumListingMediaItems) {
        return reply.code(409).send({ error: 'Maximum listing photos reached' });
      }

      const protection = await checkHumanProtectionWithChallenge(
        {
          action: 'listing.media_upload',
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

      const declaredMimeType = normalizeListingImageMime(request.headers['content-type']);
      const buffer = Buffer.isBuffer(request.body) ? request.body : null;

      if (!declaredMimeType || !buffer || buffer.length === 0) {
        return reply.code(400).send({ error: 'A supported image body is required' });
      }
      if (buffer.length > maximumListingImageBytes) {
        return reply.code(413).send({ error: 'Image is too large' });
      }

      const detectedMimeType = detectListingImageMime(buffer);
      if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
        return reply.code(400).send({ error: 'Unsupported or mismatched image type' });
      }

      const mediaId = randomUUID();
      const extension = extensionForListingImage(detectedMimeType);
      const objectKey = `listing-media/${listing.id}/${mediaId}.${extension}`;
      const storage = getListingMediaStorage();
      let stored;

      try {
        stored = await storage.put({
          objectKey,
          buffer,
          mimeType: detectedMimeType
        });
      } catch (error) {
        request.log.warn({ error }, 'listing media storage write failed');
        return reply.code(503).send({ error: 'Media storage unavailable' });
      }

      let inserted;
      try {
        inserted = await db.insertInto('listing_media')
          .values({
            id: mediaId,
            listing_id: listing.id,
            object_key: stored.objectKey,
            mime_type: detectedMimeType,
            width: query.width ?? null,
            height: query.height ?? null,
            size_bytes: buffer.length,
            sort_order: query.sortOrder ?? existingCount,
            alt_text: query.altText || null,
            sha256: stored.sha256
          })
          .returning([
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
          .executeTakeFirstOrThrow();
      } catch (error) {
        request.log.error({ error }, 'listing media database write failed');
        try {
          await storage.remove(stored.objectKey);
        } catch (cleanupError) {
          request.log.warn({ cleanupError }, 'listing media rollback failed');
        }
        return reply.code(500).send({ error: 'Media could not be saved' });
      }

      await db.updateTable('listings')
        .set({ updated_at: new Date() })
        .where('id', '=', listing.id)
        .where('seller_id', '=', authRequest.user.sub)
        .execute();

      writeSecurityAudit(app.log, {
        action: 'listing.media_upload',
        decision: 'allow',
        actorId: authRequest.user.sub,
        targetId: listing.id,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes,
        metadata: {
          mediaId: inserted.id,
          mimeType: detectedMimeType,
          sizeBytes: buffer.length,
          storageDriver: storage.driver,
          transport: 'binary'
        }
      });

      return reply.code(201).send({
        media: mediaSummary(inserted),
        mediaCount: existingCount + 1
      });
    }
  );
}
