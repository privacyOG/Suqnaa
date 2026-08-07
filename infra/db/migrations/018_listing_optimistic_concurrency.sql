ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS edit_version integer NOT NULL DEFAULT 1;

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_edit_version_positive;

ALTER TABLE listings
  ADD CONSTRAINT listings_edit_version_positive CHECK (edit_version > 0);

CREATE OR REPLACE FUNCTION bump_listing_edit_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.edit_version := OLD.edit_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_bump_edit_version ON listings;

CREATE TRIGGER listings_bump_edit_version
BEFORE UPDATE ON listings
FOR EACH ROW
EXECUTE FUNCTION bump_listing_edit_version();
