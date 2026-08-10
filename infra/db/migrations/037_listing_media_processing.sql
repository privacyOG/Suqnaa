CREATE TABLE IF NOT EXISTS listing_media_quarantine (
  id uuid PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  review_provider text NOT NULL CHECK (length(review_provider) <= 80),
  review_reference text CHECK (review_reference IS NULL OR length(review_reference) <= 200),
  review_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolution text CHECK (resolution IS NULL OR resolution IN ('approved', 'rejected', 'expired'))
);

CREATE INDEX IF NOT EXISTS listing_media_quarantine_listing_idx
  ON listing_media_quarantine(listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS listing_media_quarantine_expiry_idx
  ON listing_media_quarantine(expires_at)
  WHERE resolved_at IS NULL;
