CREATE INDEX IF NOT EXISTS listings_search_vector_idx
  ON listings
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '')
    )
  );

CREATE INDEX IF NOT EXISTS listings_public_filter_idx
  ON listings(status, category_id, condition, currency_code, country_code, created_at DESC);
