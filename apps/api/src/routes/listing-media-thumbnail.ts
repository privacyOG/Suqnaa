import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { getListingMediaStorage } from '../media/listing-media-storage.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

const paramsSchema = z.object({
  listingId: z.string().uuid(),
  mediaId: z.string().uuid()
});

export async function listingMediaThumbnailRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings/:listingId/media/:mediaId/thumbnail', async (request, reply) => {
    const rateLimit = await checkSharedRateLimit({
      group: 'listing.public_media_thumbnail',
      identifiers: [`ip:${request.ip}`],
      limit: 900,
      windowMs: 5 * 60 * 1000
    });
    if (!rateLimit.allowed) {
      reply.header('Retry-After', String(rateLimit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(rateLimit));
    }

    const params = paramsSchema.parse(request.params);
    const derivative = await db.selectFrom('listing_media_derivatives')
      .innerJoin('listing_media', 'listing_media.id', 'listing_media_derivatives.media_id')
      .innerJoin('listings', 'listings.id', 'listing_media.listing_id')
      .innerJoin('users', 'users.id', 'listings.seller_id')
      .select([
        'listing_media_derivatives.object_key as object_key',
        'listing_media_derivatives.mime_type as mime_type',
        'users.status as seller_status'
      ])
      .where('listing_media_derivatives.media_id', '=', params.mediaId)
      .where('listing_media_derivatives.kind', '=', 'thumbnail')
      .where('listing_media.listing_id', '=', params.listingId)
      .where('listings.status', '=', 'active')
      .executeTakeFirst();

    if (!derivative || derivative.seller_status === 'suspended' || derivative.seller_status === 'closed') {
      return reply.code(404).send({ error: 'Media not found' });
    }

    let delivery;
    try {
      delivery = await getListingMediaStorage().deliver(
        String(derivative.object_key),
        String(derivative.mime_type)
      );
    } catch (error) {
      request.log.warn({ error }, 'listing media thumbnail delivery failed');
      return reply.code(404).send({ error: 'Media not found' });
    }

    reply.header('Cache-Control', delivery.cacheControl);
    reply.header('X-Content-Type-Options', 'nosniff');
    if (delivery.type === 'redirect') {
      reply.header('Location', delivery.url);
      return reply.code(302).send();
    }
    reply.header('Content-Type', delivery.mimeType);
    reply.header('Content-Length', String(delivery.buffer.length));
    return reply.send(delivery.buffer);
  });
}
