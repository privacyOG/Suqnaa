-- Normalize any pre-existing listing geography onto the public marketplace privacy grid.
-- The application never exposes this point directly; it is used only for spatial filtering/sorting.
UPDATE listings
SET location = ST_SetSRID(
  ST_MakePoint(
    round(ST_X(location::geometry)::numeric, 2)::double precision,
    round(ST_Y(location::geometry)::numeric, 2)::double precision
  ),
  4326
)::geography
WHERE location IS NOT NULL;

ALTER TABLE listings
  ADD CONSTRAINT listings_location_privacy_grid_check
  CHECK (
    location IS NULL OR (
      ST_SRID(location::geometry) = 4326
      AND ST_X(location::geometry) BETWEEN -180 AND 180
      AND ST_Y(location::geometry) BETWEEN -90 AND 90
      AND abs(
        ST_X(location::geometry)
        - round(ST_X(location::geometry)::numeric, 2)::double precision
      ) < 0.0000001
      AND abs(
        ST_Y(location::geometry)
        - round(ST_Y(location::geometry)::numeric, 2)::double precision
      ) < 0.0000001
    )
  );

CREATE INDEX IF NOT EXISTS listings_active_location_gist_idx
  ON listings USING GIST(location)
  WHERE status = 'active' AND location IS NOT NULL;
