ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'in_stock'
    CHECK (availability_status IN ('in_stock', 'limited', 'out_of_stock', 'service_available')),
  ADD COLUMN IF NOT EXISTS available_quantity integer
    CHECK (available_quantity IS NULL OR (available_quantity >= 0 AND available_quantity <= 1000000)),
  ADD COLUMN IF NOT EXISTS unit_label text
    CHECK (unit_label IS NULL OR length(unit_label) <= 40);

ALTER TABLE listing_media
  ADD COLUMN IF NOT EXISTS alt_text text CHECK (alt_text IS NULL OR length(alt_text) <= 180),
  ADD COLUMN IF NOT EXISTS sha256 text CHECK (sha256 IS NULL OR length(sha256) = 64);

CREATE INDEX IF NOT EXISTS listing_media_listing_sort_idx
  ON listing_media(listing_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS listing_media_object_key_unique_idx
  ON listing_media(object_key);
