import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { getListingMediaStorage } from '../media/listing-media-storage.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import { checkHumanProtectionWithChallenge, humanProtectionResponse } from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();
const maximumMediaItemsPerListing = 8;
const maximumImageBytes = 4 * 1024 * 1024;
const maximumBase64Length = 6 * 1024 * 1024;

const listingStatus = z.enum(['draft', 'active', 'reserved', 'sold', 'expired', 'removed']);
type ListingStatus = z.infer<typeof listingStatus>;

type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

const availabilityStatus = z.enum(['in_stock', 'limited', 'out_of_stock', 'service_available']);

const listingParams = z.object({
  listingId: z.string().uuid()
});

const listingMediaParams = z.object({
  listingId: z.string().uuid(),
  mediaId: z.string().uuid()
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

const publicListingsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional()
});

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
  availabilityStatus: availabilityStatus.default('in_stock'),
  availableQuantity: z.number().int().min(0).max(1000000).optional(),
  unitLabel: z.string().trim().min(1).max(40).optional(),
  countryCode: z.string().length(2),
  region: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  suburb: z.string().max(120).optional(),
  allowPickup: z.boolean().default(true),
  allowDelivery: z.boolean().default(false)
});

const mediaUploadBody = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().min(1).max(maximumImageBytes),
  base64Data: z.string().min(1).max(maximumBase64Length),
  width: z.number().int().min(1).max(12000).optional(),
  height: z.number().int().min(1).max(12000).optional(),
  altText: z.string().trim().max(180).optional(),
  sortOrder: z.number().int().min(0).max(100).optional()
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

function limitedListingMediaUpload(request: FastifyRequest, accountId: string) {
  const accountLimit = checkRateLimit({
    group: 'listing.media.account',
    identifiers: [`account:${accountId}`],
    limit: 80,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: 'listing.media.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 160,
    windowMs: 60 * 60 * 1000
  });

  return !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;
}

function enforcePublicListingLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  group: string,
  limit: number
): boolean {
  const result = checkRateLimit({
    group,
    identifiers: [`ip:${request.ip}`],
    limit,
    windowMs: 5 * 60 * 1000
  });

  if (result.allowed) {
    return true;
  }

  reply.header('Retry-After', String(result.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(result));
  return false;
}

function stripBase64DataUrl(value: string): string {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(',');
  const payload = trimmed.startsWith('data:') && commaIndex >= 0
    ? trimmed.slice(commaIndex + 1)
    : trimmed;
  return payload.replace(/\s+/g, '');
}

function detectImageMime(buffer: Buffer): SupportedImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function extensionForMime(mimeType: SupportedImageMime): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
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

async function getListingMedia(listingId: string, limit = maximumMediaItemsPerListing) {
  const rows = await db.selectFrom('listing_media')
    .select(['id', 'listing_id', 'mime_type', 'width', 'height', 'size_bytes', 'sort_order', 'alt_text', 'created_at'])
    .where('listing_id', '=', listingId)
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'asc')
    .limit(limit)
    .execute();
  return rows.map((row) => mediaSummary(row));
}

async function countListingMedia(listingId: string): Promise<number> {
  const row = await db.selectFrom('listing_media')
    .select((expression) => expression.fn.countAll<number>().as('count'))
    .where('listing_id', '=', listingId)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

function listingSummary(
  listing: Record<string, unknown>,
  seller: Record<string, unknown> | undefined,
  media: Array<ReturnType<typeof mediaSummary>> = [],
  mediaCount = media.length
) {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    priceAmount: listing.price_amount,
    currencyCode: listing.currency_code,
    condition: listing.condition,
    availabilityStatus: listing.availability_status ?? 'in_stock',
    availableQuantity: listing.available_quantity ?? null,
    unitLabel: listing.unit_label ?? null,
    countryCode: listing.country_code,
    region: listing.region,
    city: listing.city,
    suburb: listing.suburb,
    allowPickup: listing.allow_pickup,
    allowDelivery: listing.allow_delivery,
    publishedAt: listing.published_at,
    createdAt: listing.created_at,
    media,
    mediaCount,
    seller: seller
      ? {
          id: seller.id,
          displayName: seller.display_name,
          status: seller.status
        }
      : null
  };
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
        'availability_status',
        'available_quantity',
        'unit_label',
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
    const listings = await Promise.all(page.map(async (listing) => {
      const [media, mediaCount] = await Promise.all([
        getListingMedia(listing.id, 1),
        countListingMedia(listing.id)
      ]);
      return {
        id: listing.id,
        title: listing.title,
        description: listing.description,
        priceAmount: listing.price_amount,
        currencyCode: listing.currency_code,
        condition: listing.condition,
        availabilityStatus: listing.availability_status,
        availableQuantity: listing.available_quantity,
        unitLabel: listing.unit_label,
        status: listing.status,
        countryCode: listing.country_code,
        region: listing.region,
        city: listing.city,
        suburb: listing.suburb,
        allowPickup: listing.allow_pickup,
        allowDelivery: listing.allow_delivery,
        media,
        mediaCount,
        createdAt: listing.created_at,
        updatedAt: listing.updated_at
      };
    }));
    const last = page.at(-1);

    return reply.send({
      listings,
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

    const now = new Date();
    const updated = await db.updateTable('listings')
      .set({
        status: body.status,
        updated_at: now,
        ...(body.status === 'active' ? { published_at: now } : {})
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

  app.post('/listings/:listingId/media', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = listingParams.parse(request.params);
    const body = mediaUploadBody.parse(request.body);
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
    if (existingCount >= maximumMediaItemsPerListing) {
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

    let buffer: Buffer;
    try {
      buffer = Buffer.from(stripBase64DataUrl(body.base64Data), 'base64');
    } catch {
      return reply.code(400).send({ error: 'Invalid image payload' });
    }

    if (buffer.length !== body.sizeBytes || buffer.length > maximumImageBytes) {
      return reply.code(400).send({ error: 'Image size mismatch' });
    }

    const detectedMimeType = detectImageMime(buffer);
    if (!detectedMimeType || detectedMimeType !== body.mimeType) {
      return reply.code(400).send({ error: 'Unsupported or mismatched image type' });
    }

    const mediaId = randomUUID();
    const extension = extensionForMime(detectedMimeType);
    const objectKey = `listing-media/${listing.id}/${mediaId}.${extension}`;
    let stored;

    try {
      stored = await getListingMediaStorage().put({
        objectKey,
        buffer,
        mimeType: detectedMimeType
      });
    } catch (error) {
      request.log.warn({ error }, 'listing media storage write failed');
      return reply.code(503).send({ error: 'Media storage unavailable' });
    }

    const now = new Date();
    const inserted = await db.insertInto('listing_media')
      .values({
        id: mediaId,
        listing_id: listing.id,
        object_key: stored.objectKey,
        mime_type: detectedMimeType,
        width: body.width ?? null,
        height: body.height ?? null,
        size_bytes: buffer.length,
        sort_order: body.sortOrder ?? existingCount,
        alt_text: body.altText || null,
        sha256: stored.sha256
      })
      .returning(['id', 'listing_id', 'mime_type', 'width', 'height', 'size_bytes', 'sort_order', 'alt_text', 'created_at'])
      .executeTakeFirstOrThrow();

    await db.updateTable('listings')
      .set({ updated_at: now })
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
        storageDriver: getListingMediaStorage().driver
      }
    });

    return reply.code(201).send({
      media: mediaSummary(inserted),
      mediaCount: existingCount + 1
    });
  });

  app.get('/listings', async (request, reply) => {
    if (!enforcePublicListingLimit(request, reply, 'listing.public_list', 300)) {
      return;
    }

    const query = publicListingsQuery.parse(request.query);
    let listingsQuery = db.selectFrom('listings')
      .select([
        'id',
        'seller_id',
        'title',
        'description',
        'price_amount',
        'currency_code',
        'condition',
        'availability_status',
        'available_quantity',
        'unit_label',
        'country_code',
        'region',
        'city',
        'suburb',
        'allow_pickup',
        'allow_delivery',
        'published_at',
        'created_at'
      ])
      .where('status', '=', 'active');

    if (query.before) {
      listingsQuery = listingsQuery.where('created_at', '<', new Date(query.before));
    }

    const rows = await listingsQuery
      .orderBy('created_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const summaries = await Promise.all(page.map(async (listing) => {
      const [seller, media, mediaCount] = await Promise.all([
        db.selectFrom('users')
          .select(['id', 'display_name', 'status'])
          .where('id', '=', listing.seller_id)
          .executeTakeFirst(),
        getListingMedia(listing.id, 1),
        countListingMedia(listing.id)
      ]);
      return listingSummary(listing, seller, media, mediaCount);
    }));
    const last = page.at(-1);

    return reply.send({
      listings: summaries,
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.created_at).toISOString()
          : null
      }
    });
  });

  app.get('/listings/:listingId', async (request, reply) => {
    if (!enforcePublicListingLimit(request, reply, 'listing.public_detail', 300)) {
      return;
    }

    const params = listingParams.parse(request.params);
    const listing = await db.selectFrom('listings')
      .select([
        'id',
        'seller_id',
        'category_id',
        'title',
        'description',
        'price_amount',
        'currency_code',
        'condition',
        'availability_status',
        'available_quantity',
        'unit_label',
        'status',
        'country_code',
        'region',
        'city',
        'suburb',
        'allow_pickup',
        'allow_delivery',
        'published_at',
        'expires_at',
        'created_at',
        'updated_at'
      ])
      .where('id', '=', params.listingId)
      .where('status', '=', 'active')
      .executeTakeFirst();

    if (!listing) {
      return reply.code(404).send({ error: 'Listing not found' });
    }

    const [seller, profile, verification, category, media, mediaCount] = await Promise.all([
      db.selectFrom('users')
        .select(['id', 'display_name', 'status', 'email_verified_at', 'phone_verified_at'])
        .where('id', '=', listing.seller_id)
        .executeTakeFirst(),
      db.selectFrom('user_profiles')
        .select(['trust_score', 'is_business', 'business_name', 'city', 'country_code'])
        .where('user_id', '=', listing.seller_id)
        .executeTakeFirst(),
      db.selectFrom('verification_checks')
        .select(['status', 'level', 'reviewed_at', 'expires_at'])
        .where('user_id', '=', listing.seller_id)
        .orderBy('created_at', 'desc')
        .executeTakeFirst(),
      listing.category_id
        ? db.selectFrom('categories')
            .select(['id', 'slug', 'name_en', 'name_ar'])
            .where('id', '=', listing.category_id)
            .executeTakeFirst()
        : Promise.resolve(undefined),
      getListingMedia(listing.id),
      countListingMedia(listing.id)
    ]);

    if (!seller || seller.status === 'suspended' || seller.status === 'closed') {
      return reply.code(404).send({ error: 'Listing not found' });
    }

    return reply.send({
      listing: {
        id: listing.id,
        title: listing.title,
        description: listing.description,
        priceAmount: listing.price_amount,
        currencyCode: listing.currency_code,
        condition: listing.condition,
        availabilityStatus: listing.availability_status,
        availableQuantity: listing.available_quantity,
        unitLabel: listing.unit_label,
        status: listing.status,
        countryCode: listing.country_code,
        region: listing.region,
        city: listing.city,
        suburb: listing.suburb,
        allowPickup: listing.allow_pickup,
        allowDelivery: listing.allow_delivery,
        publishedAt: listing.published_at,
        expiresAt: listing.expires_at,
        createdAt: listing.created_at,
        updatedAt: listing.updated_at,
        media,
        mediaCount,
        category: category
          ? {
              id: category.id,
              slug: category.slug,
              nameEn: category.name_en,
              nameAr: category.name_ar
            }
          : null,
        seller: {
          id: seller.id,
          displayName: seller.display_name,
          status: seller.status,
          emailVerified: Boolean(seller.email_verified_at),
          phoneVerified: Boolean(seller.phone_verified_at),
          trustScore: Number(profile?.trust_score ?? 0),
          isBusiness: Boolean(profile?.is_business),
          businessName: profile?.business_name ?? null,
          city: profile?.city ?? null,
          countryCode: profile?.country_code ?? null,
          verification: {
            status: verification?.status ?? 'unverified',
            level: verification?.level ?? null,
            reviewedAt: verification?.reviewed_at ?? null,
            expiresAt: verification?.expires_at ?? null
          }
        }
      }
    });
  });

  app.get('/listings/:listingId/media/:mediaId', async (request, reply) => {
    if (!enforcePublicListingLimit(request, reply, 'listing.public_media', 600)) {
      return;
    }

    const params = listingMediaParams.parse(request.params);
    const media = await db.selectFrom('listing_media')
      .innerJoin('listings', 'listings.id', 'listing_media.listing_id')
      .innerJoin('users', 'users.id', 'listings.seller_id')
      .select([
        'listing_media.object_key as object_key',
        'listing_media.mime_type as mime_type',
        'listings.status as listing_status',
        'users.status as seller_status'
      ])
      .where('listing_media.id', '=', params.mediaId)
      .where('listing_media.listing_id', '=', params.listingId)
      .where('listings.status', '=', 'active')
      .executeTakeFirst();

    if (!media || media.seller_status === 'suspended' || media.seller_status === 'closed') {
      return reply.code(404).send({ error: 'Media not found' });
    }

    let delivery;
    try {
      delivery = await getListingMediaStorage().deliver(
        String(media.object_key),
        String(media.mime_type)
      );
    } catch (error) {
      request.log.warn({ error }, 'listing media delivery failed');
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
        availability_status: body.availabilityStatus,
        available_quantity: body.availableQuantity ?? null,
        unit_label: body.unitLabel ?? null,
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
