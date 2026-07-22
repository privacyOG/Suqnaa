import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(
  new URL('../routes/listing-search.ts', import.meta.url),
  'utf8'
);
const migration = readFileSync(
  new URL('../../../../infra/db/migrations/011_listing_search_indexes.sql', import.meta.url),
  'utf8'
);

assert.match(route, /publicListingSearchQuery\.parse\(request\.query\)/);
assert.match(route, /decodeListingSearchCursor\(query\.before, query\)/);
assert.match(route, /encodeListingSearchCursor\(query/);
assert.match(route, /listings\.created_at < \$\{cursor\.createdAt\}/);
assert.match(route, /listings\.id < \$\{cursor\.id\}::uuid/);
assert.match(route, /listings\.price_amount > \$\{cursor\.price\}::numeric/);
assert.match(route, /listings\.price_amount < \$\{cursor\.price\}::numeric/);
assert.match(route, /orderBy\('listings\.created_at', 'desc'\)/);
assert.match(route, /orderBy\('listings\.id', 'desc'\)/);
assert.match(route, /orderBy\('listings\.price_amount', 'asc'\)/);
assert.match(route, /orderBy\('listings\.price_amount', 'desc'\)/);
assert.match(route, /leftJoin\('categories'/);
assert.match(route, /category: listing\.category_id/);
assert.match(route, /query\.region/);
assert.match(route, /query\.city/);
assert.match(route, /query\.suburb/);
assert.match(route, /query\.fulfilment === 'both'/);
assert.match(route, /allow_pickup', '=', true/);
assert.match(route, /allow_delivery', '=', true/);
assert.match(route, /ESCAPE E'\\\\'/);
assert.doesNotMatch(route, /object_key/);

assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
assert.match(migration, /listings_active_newest_cursor_idx/);
assert.match(migration, /listings_active_price_cursor_idx/);
assert.match(migration, /listings_active_filter_idx/);
assert.match(migration, /listings_active_search_document_idx/);
assert.match(migration, /to_tsvector/);
assert.match(migration, /listings_active_region_trgm_idx/);
assert.match(migration, /listings_active_city_trgm_idx/);
assert.match(migration, /listings_active_suburb_trgm_idx/);
assert.match(migration, /WHERE status = 'active'/g);
