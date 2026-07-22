import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import {
  decodeListingSearchCursor,
  encodeListingSearchCursor,
  publicListingSearchQuery
} from '../search/listing-search-policy.js';

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

function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export async function listingSearchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings/search', async (request, reply) => {
    if (!enforcePublicSearchLimit(request, reply)) {
      return;
    }

    const query = publicListingSearchQuery.parse(request.query);
    let listingsQuery = db.selectFrom('listings')
      .innerJoin('users', 'users.id', 'listings.seller_id')
      .leftJoin('categories', 'categories.id', 'listings.category_id')
      .select([
        'listings.id as id',
        'listings.category_id as category_id',
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
        'users.status as seller_status',
        'categories.slug as category_slug',
        'categories.name_en as category_name_en',
        'categories.name_ar as category_name_ar'
      ])
      .where('listings.status', '=', 'active')
      .where('users.status', 'not in', ['suspended', 'closed']);

    if (query.before) {
      let cursor;
      try {
        cursor = decodeListingSearchCursor(query.before, query);
      } catch {
        return reply.code(400).send({ error: 'Invalid listing search cursor' });
      }

      if (cursor.kind === 'legacy') {
        listingsQuery = listingsQuery.where(
          'listings.created_at',
          '<',
          cursor.createdAt
        );
      } else if (query.sort === 'newest') {
        listingsQuery = listingsQuery.where(sql<boolean>`
          listings.created_at < ${cursor.createdAt}
          OR (
            listings.created_at = ${cursor.createdAt}
            AND listings.id < ${cursor.id}::uuid
          )
        `);
      } else if (query.sort === 'price_asc') {
        listingsQuery = listingsQuery.where(sql<boolean>`
          listings.price_amount > ${cursor.price}::numeric
          OR (
            listings.price_amount = ${cursor.price}::numeric
            AND (
              listings.created_at < ${cursor.createdAt}
              OR (
                listings.created_at = ${cursor.createdAt}
                AND listings.id < ${cursor.id}::uuid
              )
            )
          )
        `);
      } else {
        listingsQuery = listingsQuery.where(sql<boolean>`
          listings.price_amount < ${cursor.price}::numeric
          OR (
            listings.price_amount = ${cursor.price}::numeric
            AND (
              listings.created_at < ${cursor.createdAt}
              OR (
                listings.created_at = ${cursor.createdAt}
                AND listings.id < ${cursor.id}::uuid
              )
            )
          )
        `);
      }
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
      listingsQuery = listingsQuery.where('listings.currency_code', '=', query.currency);
    }
    if (query.country) {
      listingsQuery = listingsQuery.where('listings.country_code', '=', query.country);
    }
    if (query.region) {
      listingsQuery = listingsQuery.where(sql<boolean>`
        listings.region ILIKE ${containsPattern(query.region)} ESCAPE E'\\'
      `);
    }
    if (query.city) {
      listingsQuery = listingsQuery.where(sql<boolean>`
        listings.city ILIKE ${containsPattern(query.city)} ESCAPE E'\\'
      `);
    }
    if (query.suburb) {
      listingsQuery = listingsQuery.where(sql<boolean>`
        listings.suburb ILIKE ${containsPattern(query.suburb)} ESCAPE E'\\'
      `);
    }
    if (query.fulfilment === 'pickup') {
      listingsQuery = listingsQuery.where('listings.allow_pickup', '=', true);
    }
    if (query.fulfilment === 'delivery') {
      listingsQuery = listingsQuery.where('listings.allow_delivery', '=', true);
    }
    if (query.fulfilment === 'both') {
      listingsQuery = listingsQuery
        .where('listings.allow_pickup', '=', true)
        .where('listings.allow_delivery', '=', true);
    }

    if (query.sort === 'price_asc') {
      listingsQuery = listingsQuery.orderBy('listings.price_amount', 'asc');
    } else if (query.sort === 'price_desc') {
      listingsQuery = listingsQuery.orderBy('listings.price_amount', 'desc');
    }

    const rows = await listingsQuery
      .orderBy('listings.created_at', 'desc')
      .orderBy('listings.id', 'desc')
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
        category: listing.category_id
          ? {
              id: listing.category_id,
              slug: listing.category_slug,
              nameEn: listing.category_name_en,
              nameAr: listing.category_name_ar
            }
          : null,
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
          ? encodeListingSearchCursor(query, {
              createdAt: last.created_at,
              id: last.id,
              price: last.price_amount
            })
          : null
      }
    });
  });
}
