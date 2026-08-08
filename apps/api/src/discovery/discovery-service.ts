import { sql, type Transaction } from 'kysely';
import { z } from 'zod';
import { resolveDiscoveryNotificationConfiguration } from '../config/discovery-notification-config.js';
import { db } from '../db/index.js';
import type { Database } from '../db/types.js';
import {
  listingLocationPoint,
  maximumNearbyRadiusKm
} from '../listings/listing-location.js';
import {
  listingSearchFilterFingerprint,
  publicListingSearchQuery
} from '../search/listing-search-policy.js';

const savedSearchFilterInput = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts_or_repair']).optional(),
  availabilityStatus: z.enum([
    'in_stock',
    'limited',
    'out_of_stock',
    'service_available'
  ]).optional(),
  minPrice: z.number().finite().nonnegative().max(1_000_000_000_000).optional(),
  maxPrice: z.number().finite().nonnegative().max(1_000_000_000_000).optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  region: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  suburb: z.string().trim().min(1).max(120).optional(),
  fulfilment: z.enum(['pickup', 'delivery', 'both']).optional(),
  nearLat: z.number().finite().min(-90).max(90).optional(),
  nearLon: z.number().finite().min(-180).max(180).optional(),
  radiusKm: z.number().finite().min(1).max(maximumNearbyRadiusKm).optional()
}).strict();

export type SavedSearchFilters = z.infer<typeof savedSearchFilterInput>;

export class DiscoveryNotFoundError extends Error {}
export class DiscoveryLimitError extends Error {}
export class DiscoveryConflictError extends Error {}

const configuration = resolveDiscoveryNotificationConfiguration();
const discoveryWorkerLockKey = 742016;
const likeEscapeCharacter = '\\';

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function normalizeSavedSearchFilters(input: unknown): {
  filters: SavedSearchFilters;
  fingerprint: string;
} {
  const filters = savedSearchFilterInput.parse(input);
  const query = publicListingSearchQuery.parse({
    ...filters,
    limit: 20,
    sort: 'newest'
  });

  return {
    filters: {
      ...(query.q ? { q: query.q } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.condition ? { condition: query.condition } : {}),
      ...(query.availabilityStatus
        ? { availabilityStatus: query.availabilityStatus }
        : {}),
      ...(query.minPrice !== undefined ? { minPrice: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { maxPrice: query.maxPrice } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.country ? { country: query.country } : {}),
      ...(query.region ? { region: query.region } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.suburb ? { suburb: query.suburb } : {}),
      ...(query.fulfilment ? { fulfilment: query.fulfilment } : {}),
      ...(query.nearLat !== undefined ? { nearLat: query.nearLat } : {}),
      ...(query.nearLon !== undefined ? { nearLon: query.nearLon } : {}),
      ...(query.radiusKm !== undefined ? { radiusKm: query.radiusKm } : {})
    },
    fingerprint: listingSearchFilterFingerprint(query)
  };
}

function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function applySavedSearchFilters(query: any, filters: SavedSearchFilters): any {
  let output = query;
  if (filters.q) {
    output = output.where(sql<boolean>`
      to_tsvector(
        'simple',
        coalesce(listings.title, '') || ' ' || coalesce(listings.description, '')
      ) @@ plainto_tsquery('simple', ${filters.q})
    `);
  }
  if (filters.categoryId) {
    output = output.where('listings.category_id', '=', filters.categoryId);
  }
  if (filters.condition) {
    output = output.where('listings.condition', '=', filters.condition);
  }
  if (filters.availabilityStatus) {
    output = output.where(
      'listings.availability_status',
      '=',
      filters.availabilityStatus
    );
  }
  if (filters.minPrice !== undefined) {
    output = output.where('listings.price_amount', '>=', filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    output = output.where('listings.price_amount', '<=', filters.maxPrice);
  }
  if (filters.currency) {
    output = output.where('listings.currency_code', '=', filters.currency);
  }
  if (filters.country) {
    output = output.where('listings.country_code', '=', filters.country);
  }
  if (filters.region) {
    output = output.where(sql<boolean>`
      listings.region ILIKE ${containsPattern(filters.region)} ESCAPE ${likeEscapeCharacter}
    `);
  }
  if (filters.city) {
    output = output.where(sql<boolean>`
      listings.city ILIKE ${containsPattern(filters.city)} ESCAPE ${likeEscapeCharacter}
    `);
  }
  if (filters.suburb) {
    output = output.where(sql<boolean>`
      listings.suburb ILIKE ${containsPattern(filters.suburb)} ESCAPE ${likeEscapeCharacter}
    `);
  }
  if (
    filters.nearLat !== undefined &&
    filters.nearLon !== undefined &&
    filters.radiusKm !== undefined
  ) {
    const searchPoint = listingLocationPoint(filters.nearLat, filters.nearLon);
    output = output.where(sql<boolean>`
      ST_DWithin(listings.location, ${searchPoint}, ${filters.radiusKm * 1000})
    `);
  }
  if (filters.fulfilment === 'pickup') {
    output = output.where('listings.allow_pickup', '=', true);
  }
  if (filters.fulfilment === 'delivery') {
    output = output.where('listings.allow_delivery', '=', true);
  }
  if (filters.fulfilment === 'both') {
    output = output
      .where('listings.allow_pickup', '=', true)
      .where('listings.allow_delivery', '=', true);
  }
  return output;
}

async function activePublicListingExists(listingId: string): Promise<boolean> {
  const row = await db.selectFrom('listings')
    .innerJoin('users', 'users.id', 'listings.seller_id')
    .select('listings.id as id')
    .where('listings.id', '=', listingId)
    .where('listings.status', '=', 'active')
    .where('users.status', 'not in', ['suspended', 'closed'])
    .executeTakeFirst();
  return Boolean(row);
}

async function requireActivePublicListing(listingId: string): Promise<void> {
  if (!await activePublicListingExists(listingId)) {
    throw new DiscoveryNotFoundError('Listing not found');
  }
}

async function relationshipCount(
  table: 'saved_listings' | 'listing_watchlist',
  userId: string
): Promise<number> {
  const row = await db.selectFrom(table)
    .select((expression) => expression.fn.countAll<number>().as('count'))
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function getListingDiscoveryState(userId: string, listingId: string) {
  await requireActivePublicListing(listingId);
  const [saved, watched] = await Promise.all([
    db.selectFrom('saved_listings')
      .select('listing_id')
      .where('user_id', '=', userId)
      .where('listing_id', '=', listingId)
      .executeTakeFirst(),
    db.selectFrom('listing_watchlist')
      .select('listing_id')
      .where('user_id', '=', userId)
      .where('listing_id', '=', listingId)
      .executeTakeFirst()
  ]);
  return { listingId, saved: Boolean(saved), watching: Boolean(watched) };
}

async function addListingRelationship(
  table: 'saved_listings' | 'listing_watchlist',
  userId: string,
  listingId: string,
  limit: number
) {
  await requireActivePublicListing(listingId);
  const existing = await db.selectFrom(table)
    .select('listing_id')
    .where('user_id', '=', userId)
    .where('listing_id', '=', listingId)
    .executeTakeFirst();
  if (existing) return { listingId, unchanged: true };

  if (await relationshipCount(table, userId) >= limit) {
    throw new DiscoveryLimitError('Discovery list limit reached');
  }

  await db.insertInto(table)
    .values({ user_id: userId, listing_id: listingId, created_at: new Date() })
    .onConflict((conflict) => conflict.columns(['user_id', 'listing_id']).doNothing())
    .execute();
  return { listingId, unchanged: false };
}

async function removeListingRelationship(
  table: 'saved_listings' | 'listing_watchlist',
  userId: string,
  listingId: string
) {
  const result = await db.deleteFrom(table)
    .where('user_id', '=', userId)
    .where('listing_id', '=', listingId)
    .executeTakeFirst();
  return { listingId, unchanged: Number(result.numDeletedRows ?? 0) === 0 };
}

export function saveListing(userId: string, listingId: string) {
  return addListingRelationship(
    'saved_listings',
    userId,
    listingId,
    configuration.savedListingLimit
  );
}

export function removeSavedListing(userId: string, listingId: string) {
  return removeListingRelationship('saved_listings', userId, listingId);
}

export function watchListing(userId: string, listingId: string) {
  return addListingRelationship(
    'listing_watchlist',
    userId,
    listingId,
    configuration.watchlistLimit
  );
}

export function removeWatchedListing(userId: string, listingId: string) {
  return removeListingRelationship('listing_watchlist', userId, listingId);
}

interface RelationshipRow {
  listing_id: string;
  relation_at: Date | string;
  view_count?: number;
}

async function publicListingSummaries(listingIds: string[]) {
  if (listingIds.length === 0) return new Map<string, Record<string, unknown>>();
  const rows = await db.selectFrom('listings')
    .innerJoin('users', 'users.id', 'listings.seller_id')
    .select([
      'listings.id as id',
      'listings.title as title',
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
      'listings.updated_at as updated_at',
      'users.display_name as seller_display_name'
    ])
    .where('listings.id', 'in', listingIds)
    .where('listings.status', '=', 'active')
    .where('users.status', 'not in', ['suspended', 'closed'])
    .execute();
  const mediaRows = await db.selectFrom('listing_media')
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
    .where('listing_id', 'in', listingIds)
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();
  const firstMedia = new Map<string, Record<string, unknown>>();
  for (const media of mediaRows) {
    if (!firstMedia.has(String(media.listing_id))) {
      const listingId = String(media.listing_id);
      const mediaId = String(media.id);
      firstMedia.set(listingId, {
        id: mediaId,
        url: `/v1/listings/${listingId}/media/${mediaId}`,
        mimeType: media.mime_type,
        width: media.width,
        height: media.height,
        sizeBytes: media.size_bytes,
        sortOrder: media.sort_order,
        altText: media.alt_text ?? null,
        createdAt: media.created_at
      });
    }
  }

  return new Map(rows.map((listing) => [String(listing.id), {
    id: listing.id,
    title: listing.title,
    priceAmount: listing.price_amount,
    currencyCode: listing.currency_code,
    condition: listing.condition,
    availabilityStatus: listing.availability_status,
    availableQuantity: listing.available_quantity,
    unitLabel: listing.unit_label,
    countryCode: listing.country_code,
    region: listing.region,
    city: listing.city,
    suburb: listing.suburb,
    allowPickup: listing.allow_pickup,
    allowDelivery: listing.allow_delivery,
    updatedAt: listing.updated_at,
    sellerDisplayName: listing.seller_display_name,
    media: firstMedia.has(String(listing.id)) ? [firstMedia.get(String(listing.id))] : []
  }]));
}

async function relationshipPage(
  table: 'saved_listings' | 'listing_watchlist',
  userId: string,
  limit: number
) {
  const rows = await db.selectFrom(table)
    .select(['listing_id', 'created_at as relation_at'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .orderBy('listing_id', 'desc')
    .limit(limit)
    .execute() as RelationshipRow[];
  const summaries = await publicListingSummaries(rows.map((row) => row.listing_id));
  return rows.map((row) => ({
    listingId: row.listing_id,
    relatedAt: row.relation_at,
    available: summaries.has(row.listing_id),
    listing: summaries.get(row.listing_id) ?? null
  }));
}

export function listSavedListings(userId: string, limit = 50) {
  return relationshipPage('saved_listings', userId, limit);
}

export function listWatchlist(userId: string, limit = 50) {
  return relationshipPage('listing_watchlist', userId, limit);
}

export async function recordRecentlyViewed(userId: string, listingId: string) {
  await requireActivePublicListing(listingId);
  const now = new Date();
  await db.transaction().execute(async (transaction) => {
    await transaction.insertInto('recently_viewed_listings')
      .values({
        user_id: userId,
        listing_id: listingId,
        first_viewed_at: now,
        last_viewed_at: now,
        view_count: 1
      })
      .onConflict((conflict) => conflict.columns(['user_id', 'listing_id']).doUpdateSet({
        last_viewed_at: now,
        view_count: sql`recently_viewed_listings.view_count + 1`
      }))
      .execute();

    await sql`
      DELETE FROM recently_viewed_listings
      WHERE user_id = ${userId}::uuid
        AND listing_id IN (
          SELECT listing_id
          FROM recently_viewed_listings
          WHERE user_id = ${userId}::uuid
          ORDER BY last_viewed_at DESC, listing_id DESC
          OFFSET ${configuration.recentHistoryLimit}
        )
    `.execute(transaction);
  });
  return { listingId, viewedAt: now };
}

export async function listRecentlyViewed(userId: string, limit = 50) {
  const rows = await db.selectFrom('recently_viewed_listings')
    .select([
      'listing_id',
      'last_viewed_at as relation_at',
      'view_count'
    ])
    .where('user_id', '=', userId)
    .orderBy('last_viewed_at', 'desc')
    .orderBy('listing_id', 'desc')
    .limit(limit)
    .execute() as RelationshipRow[];
  const summaries = await publicListingSummaries(rows.map((row) => row.listing_id));
  return rows
    .filter((row) => summaries.has(row.listing_id))
    .map((row) => ({
      listingId: row.listing_id,
      lastViewedAt: row.relation_at,
      viewCount: Number(row.view_count ?? 1),
      listing: summaries.get(row.listing_id) ?? null
    }));
}

export async function listSavedSearches(userId: string) {
  const rows = await db.selectFrom('saved_searches')
    .select([
      'id',
      'name',
      'filters',
      'filter_fingerprint',
      'is_active',
      'created_at',
      'updated_at'
    ])
    .where('user_id', '=', userId)
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    filters: row.filters,
    fingerprint: row.filter_fingerprint,
    active: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function createSavedSearch(
  userId: string,
  input: { name: string; filters: unknown }
) {
  const currentCount = await db.selectFrom('saved_searches')
    .select((expression) => expression.fn.countAll<number>().as('count'))
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (Number(currentCount?.count ?? 0) >= configuration.savedSearchLimit) {
    throw new DiscoveryLimitError('Saved search limit reached');
  }

  const normalized = normalizeSavedSearchFilters(input.filters);
  const now = new Date();
  try {
    const created = await db.insertInto('saved_searches')
      .values({
        user_id: userId,
        name: input.name.trim(),
        filters: JSON.stringify(normalized.filters),
        filter_fingerprint: normalized.fingerprint,
        is_active: true,
        last_evaluated_at: now,
        last_evaluated_listing_id: null,
        created_at: now,
        updated_at: now
      })
      .returning([
        'id',
        'name',
        'filters',
        'filter_fingerprint',
        'is_active',
        'created_at',
        'updated_at'
      ])
      .executeTakeFirstOrThrow();
    return {
      id: created.id,
      name: created.name,
      filters: created.filters,
      fingerprint: created.filter_fingerprint,
      active: created.is_active,
      createdAt: created.created_at,
      updatedAt: created.updated_at
    };
  } catch (error) {
    if (databaseCode(error) === '23505') {
      throw new DiscoveryConflictError('This search is already saved');
    }
    throw error;
  }
}

export async function updateSavedSearch(
  userId: string,
  searchId: string,
  input: { name?: string; filters?: unknown; active?: boolean }
) {
  try {
    return await db.transaction().execute(async (transaction) => {
      const current = await transaction.selectFrom('saved_searches')
        .select(['id', 'name', 'filters', 'filter_fingerprint', 'is_active'])
        .where('id', '=', searchId)
        .where('user_id', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw new DiscoveryNotFoundError('Saved search not found');

      const normalized = input.filters === undefined
        ? null
        : normalizeSavedSearchFilters(input.filters);
      const now = new Date();
      const resetCursor = normalized !== null || (current.is_active === false && input.active === true);
      const updated = await transaction.updateTable('saved_searches')
        .set({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(normalized !== null
            ? {
                filters: JSON.stringify(normalized.filters),
                filter_fingerprint: normalized.fingerprint
              }
            : {}),
          ...(input.active !== undefined ? { is_active: input.active } : {}),
          ...(resetCursor
            ? { last_evaluated_at: now, last_evaluated_listing_id: null }
            : {}),
          updated_at: now
        })
        .where('id', '=', searchId)
        .where('user_id', '=', userId)
        .returning([
          'id',
          'name',
          'filters',
          'filter_fingerprint',
          'is_active',
          'created_at',
          'updated_at'
        ])
        .executeTakeFirstOrThrow();

      if (normalized !== null) {
        await transaction.deleteFrom('saved_search_notifications')
          .where('saved_search_id', '=', searchId)
          .where('user_id', '=', userId)
          .execute();
      }

      return {
        id: updated.id,
        name: updated.name,
        filters: updated.filters,
        fingerprint: updated.filter_fingerprint,
        active: updated.is_active,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      };
    });
  } catch (error) {
    if (databaseCode(error) === '23505') {
      throw new DiscoveryConflictError('This search is already saved');
    }
    throw error;
  }
}

export async function deleteSavedSearch(userId: string, searchId: string) {
  const result = await db.deleteFrom('saved_searches')
    .where('id', '=', searchId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (Number(result.numDeletedRows ?? 0) === 0) {
    throw new DiscoveryNotFoundError('Saved search not found');
  }
  return { id: searchId };
}

export async function listSavedSearchNotifications(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {}
) {
  const limit = options.limit ?? 50;
  let query = db.selectFrom('saved_search_notifications')
    .innerJoin('saved_searches', 'saved_searches.id', 'saved_search_notifications.saved_search_id')
    .select([
      'saved_search_notifications.id as id',
      'saved_search_notifications.listing_id as listing_id',
      'saved_search_notifications.saved_search_id as saved_search_id',
      'saved_search_notifications.listing_edit_version as listing_edit_version',
      'saved_search_notifications.created_at as created_at',
      'saved_search_notifications.read_at as read_at',
      'saved_searches.name as search_name'
    ])
    .where('saved_search_notifications.user_id', '=', userId)
    .where('saved_searches.user_id', '=', userId);
  if (options.unreadOnly) {
    query = query.where('saved_search_notifications.read_at', 'is', null);
  }
  const rows = await query
    .orderBy('saved_search_notifications.created_at', 'desc')
    .orderBy('saved_search_notifications.id', 'desc')
    .limit(limit)
    .execute();
  const summaries = await publicListingSummaries(rows.map((row) => String(row.listing_id)));
  return rows.map((row) => ({
    id: row.id,
    searchId: row.saved_search_id,
    searchName: row.search_name,
    listingId: row.listing_id,
    listingVersion: row.listing_edit_version,
    createdAt: row.created_at,
    readAt: row.read_at,
    available: summaries.has(String(row.listing_id)),
    listing: summaries.get(String(row.listing_id)) ?? null
  }));
}

export async function markSavedSearchNotificationRead(
  userId: string,
  notificationId: string
) {
  const now = new Date();
  const updated = await db.updateTable('saved_search_notifications')
    .set({ read_at: now })
    .where('id', '=', notificationId)
    .where('user_id', '=', userId)
    .where('read_at', 'is', null)
    .returning(['id', 'read_at'])
    .executeTakeFirst();
  if (updated) return { id: updated.id, readAt: updated.read_at, unchanged: false };

  const existing = await db.selectFrom('saved_search_notifications')
    .select(['id', 'read_at'])
    .where('id', '=', notificationId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!existing) throw new DiscoveryNotFoundError('Notification not found');
  return { id: existing.id, readAt: existing.read_at, unchanged: true };
}

export async function markAllSavedSearchNotificationsRead(userId: string) {
  const now = new Date();
  const result = await db.updateTable('saved_search_notifications')
    .set({ read_at: now })
    .where('user_id', '=', userId)
    .where('read_at', 'is', null)
    .executeTakeFirst();
  return { updated: Number(result.numUpdatedRows ?? 0), readAt: now };
}

async function scanOneSavedSearch(
  transaction: Transaction<Database>,
  search: Record<string, any>,
  scanCutoff: Date,
  matchBatchSize: number
): Promise<number> {
  const normalized = normalizeSavedSearchFilters(search.filters);
  let listingQuery: any = transaction.selectFrom('listings')
    .innerJoin('users', 'users.id', 'listings.seller_id')
    .select([
      'listings.id as id',
      'listings.edit_version as edit_version',
      'listings.updated_at as updated_at'
    ])
    .where('listings.status', '=', 'active')
    .where('users.status', 'not in', ['suspended', 'closed'])
    .where('listings.seller_id', '!=', search.user_id)
    .where('listings.updated_at', '<=', scanCutoff);

  const lastAt = new Date(search.last_evaluated_at);
  if (search.last_evaluated_listing_id) {
    listingQuery = listingQuery.where(sql<boolean>`
      listings.updated_at > ${lastAt}
      OR (
        listings.updated_at = ${lastAt}
        AND listings.id > ${search.last_evaluated_listing_id}::uuid
      )
    `);
  } else {
    listingQuery = listingQuery.where('listings.updated_at', '>', lastAt);
  }
  listingQuery = applySavedSearchFilters(listingQuery, normalized.filters);

  const matches = await listingQuery
    .orderBy('listings.updated_at', 'asc')
    .orderBy('listings.id', 'asc')
    .limit(matchBatchSize)
    .execute();

  if (matches.length > 0) {
    await transaction.insertInto('saved_search_notifications')
      .values(matches.map((listing: Record<string, any>) => ({
        user_id: search.user_id,
        saved_search_id: search.id,
        listing_id: listing.id,
        listing_edit_version: Number(listing.edit_version),
        created_at: scanCutoff,
        read_at: null
      })))
      .onConflict((conflict) => conflict.columns(['saved_search_id', 'listing_id']).doNothing())
      .execute();
  }

  if (matches.length < matchBatchSize) {
    await transaction.updateTable('saved_searches')
      .set({
        last_evaluated_at: scanCutoff,
        last_evaluated_listing_id: null,
        updated_at: sql`updated_at`
      })
      .where('id', '=', search.id)
      .execute();
  } else {
    const last = matches[matches.length - 1];
    await transaction.updateTable('saved_searches')
      .set({
        last_evaluated_at: new Date(last.updated_at),
        last_evaluated_listing_id: last.id,
        updated_at: sql`updated_at`
      })
      .where('id', '=', search.id)
      .execute();
  }

  return matches.length;
}

export async function runSavedSearchNotificationSweep(scanCutoff = new Date()) {
  return db.transaction().execute(async (transaction) => {
    const lockResult = await sql<{ acquired: boolean }>`
      SELECT pg_try_advisory_xact_lock(${discoveryWorkerLockKey}) AS acquired
    `.execute(transaction);
    if (!lockResult.rows[0]?.acquired) {
      return { acquired: false, searchesProcessed: 0, matchesProcessed: 0 };
    }

    const searches = await transaction.selectFrom('saved_searches')
      .select([
        'id',
        'user_id',
        'filters',
        'last_evaluated_at',
        'last_evaluated_listing_id'
      ])
      .where('is_active', '=', true)
      .orderBy('last_evaluated_at', 'asc')
      .orderBy('id', 'asc')
      .limit(configuration.searchBatchSize)
      .forUpdate()
      .skipLocked()
      .execute();

    let matchesProcessed = 0;
    for (const search of searches) {
      matchesProcessed += await scanOneSavedSearch(
        transaction,
        search,
        scanCutoff,
        configuration.matchBatchSize
      );
    }

    return {
      acquired: true,
      searchesProcessed: searches.length,
      matchesProcessed
    };
  });
}
