CREATE TABLE IF NOT EXISTS listing_media_derivatives (
  id uuid PRIMARY KEY,
  media_id uuid NOT NULL REFERENCES listing_media(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('thumbnail')),
  object_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  width integer NOT NULL CHECK (width > 0 AND width <= 12000),
  height integer NOT NULL CHECK (height > 0 AND height <= 12000),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_id, kind)
);

CREATE INDEX IF NOT EXISTS listing_media_derivatives_media_idx
  ON listing_media_derivatives(media_id, kind);
