ALTER TABLE listing_media
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'ready'
    CHECK (processing_status IN ('pending_review', 'ready', 'quarantined', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_provider text
    CHECK (review_provider IS NULL OR length(review_provider) <= 80),
  ADD COLUMN IF NOT EXISTS review_reference text
    CHECK (review_reference IS NULL OR length(review_reference) <= 200),
  ADD COLUMN IF NOT EXISTS review_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS listing_media_publication_idx
  ON listing_media(listing_id, processing_status, sort_order, created_at);
