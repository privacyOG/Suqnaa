import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../db/index.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const listingCondition = z.enum([
  'new',
  'like_new',
  'good',
  'fair',
  'parts_or_repair'
]);

const availabilityStatus = z.enum([
  'in_stock',
  'limited',
  'out_of_stock',
  'service_available'
]);

const publicListingSearchQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  condition: listingCondition.optional(),
  availabilityStatus: availabilityStatus.optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  country: z.string().trim().length(2).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  fulfilment: z.enum(['pickup', 'delivery']).optional()
}).superRefine((value, context) => {
  if (
    value.minPrice !== undefined &&
    value.maxPrice !== undefined &&
    value.minPrice > value.maxPrice
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxPrice'],
      message: 'Maximum price must be greater than or equal to minimum price'
    });
  }
});

function enforcePublicSearchLimit(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const result = checkRateLimit({
    group: 'listing.public_search',
    identifiers: [`ip:${request.ip}`],
    limit: 240,
    windowMs: 5 * 60 * 1000
  });

  if (result.allowed) {
    return true;
  }

  reply.header('Retry-After', String(result.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(result));
  return false;
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

async function getListingMedia(listingId: string, limit = 1) {
  const rows = await db.selectFrom('listing_media')
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

export async function listingSearchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings/search', async (request, reply) => {
    if (!enforcePublicSearchLimit(request, reply)) {
      return;
    }

    const query = publicListingSearchQuery.parse(request.query);
    let listingsQuery = db.selectFrom('listings')
      .innerJoin('users', 'users.id', 'listings.seller_id')
      .select([
        'listings.id as id',
        'listings.title as title',
        'listings.description as description',
        'listings.price_amount as price_amount',
        'listings.currency_code as currency_code',
        'listings.condition as condition',
        'listings.availability_status as availability_status',
        'listings.available_quantity as available_quantity',
        'listings.unit_label as unit_label',
        'listings.country_code as country_code',
        'listings.region as region',
        'listings.city as city',
        'listings.suburb as suburb',
        'listings.allow_pickup as allow_pickup',
        'listings.allow_delivery as allow_delivery',
        'listings.published_at as published_at',
        'listings.created_at as created_at',
        'users.id as seller_id',
        'users.display_name as seller_display_name',
        'users.status as seller_status'
      ])
      .where('listings.status', '=', 'active')
      .where('users.status', 'not in', ['suspended', 'closed']);

    if (query.before) {
      listingsQuery = listingsQuery.where('listings.created_at', '<', new Date(query.before));
    }
    if (query.q) {
      listingsQuery = listingsQuery.where(sql<boolean>`
        to_tsvector(
          'simple',
          coalesce(listings.title, '') || ' ' || coalesce(listings.description, '')
        ) @@ plainto_tsquery('simple', ${query.q})
      `);
    }
    if (query.categoryId) {
      listingsQuery = listingsQuery.where('listings.category_id', '=', query.categoryId);
    }
    if (query.condition) {
      listingsQuery = listingsQuery.where('listings.condition', '=', query.condition);
    }
    if (query.availabilityStatus) {
      listingsQuery = listingsQuery.where(
        'listings.availability_status',
        '=',
        query.availabilityStatus
      );
    }
    if (query.minPrice !== undefined) {
      listingsQuery = listingsQuery.where('listings.price_amount', '>=', query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      listingsQuery = listingsQuery.where('listings.price_amount', '<=', query.maxPrice);
    }
    if (query.currency) {
      listingsQuery = listingsQuery.where(
        'listings.currency_code',
        '=',
        query.currency.toUpperCase()
      );
    }
    if (query.country) {
      listingsQuery = listingsQuery.where(
        'listings.country_code',
        '=',
        query.country.toUpperCase()
      );
    }
    if (query.city) {
      listingsQuery = listingsQuery.where(
        'listings.city',
        'ilike',
        `%${query.city}%`
      );
    }
    if (query.fulfilment === 'pickup') {
      listingsQuery = listingsQuery.where('listings.allow_pickup', '=', true);
    }
    if (query.fulfilment === 'delivery') {
      listingsQuery = listingsQuery.where('listings.allow_delivery', '=', true);
    }

    const rows = await listingsQuery
      .orderBy('listings.created_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const listings = await Promise.all(page.map(async (listing) => {
      const [media, mediaCount] = await Promise.all([
        getListingMedia(listing.id),
        countListingMedia(listing.id)
      ]);

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
        seller: {
          id: listing.seller_id,
          displayName: listing.seller_display_name,
          status: listing.seller_status
        }
      };
    }));
    const last = page.at(-1);

    return reply.send({
      listings,
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.created_at).toISOString()
          : null
      }
    });
  });
}
