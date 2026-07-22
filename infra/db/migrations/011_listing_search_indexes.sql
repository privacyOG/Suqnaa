CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS listings_active_newest_cursor_idx
  ON listings (created_at DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS listings_active_price_cursor_idx
  ON listings (currency_code, price_amount, created_at DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS listings_active_filter_idx
  ON listings (
    category_id,
    condition,
    availability_status,
    country_code,
    created_at DESC,
    id DESC
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS listings_active_pickup_idx
  ON listings (created_at DESC, id DESC)
  WHERE status = 'active' AND allow_pickup = true;

CREATE INDEX IF NOT EXISTS listings_active_delivery_idx
  ON listings (created_at DESC, id DESC)
  WHERE status = 'active' AND allow_delivery = true;

CREATE INDEX IF NOT EXISTS listings_active_search_document_idx
  ON listings USING gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '')
    )
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS listings_active_region_trgm_idx
  ON listings USING gin (lower(region) gin_trgm_ops)
  WHERE status = 'active' AND region IS NOT NULL;

CREATE INDEX IF NOT EXISTS listings_active_city_trgm_idx
  ON listings USING gin (lower(city) gin_trgm_ops)
  WHERE status = 'active' AND city IS NOT NULL;

CREATE INDEX IF NOT EXISTS listings_active_suburb_trgm_idx
  ON listings USING gin (lower(suburb) gin_trgm_ops)
  WHERE status = 'active' AND suburb IS NOT NULL;
