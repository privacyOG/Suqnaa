ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS last_renewed_at timestamptz;

UPDATE listings
SET
  available_quantity = CASE
    WHEN availability_status = 'service_available' THEN NULL
    WHEN status IN ('reserved', 'sold') THEN 0
    ELSE COALESCE(available_quantity, 1)
  END,
  availability_status = CASE
    WHEN availability_status = 'service_available' THEN 'service_available'
    WHEN status IN ('reserved', 'sold') THEN 'out_of_stock'
    WHEN COALESCE(available_quantity, 1) = 0 THEN 'out_of_stock'
    WHEN availability_status = 'out_of_stock' THEN 'in_stock'
    ELSE availability_status
  END,
  expires_at = CASE
    WHEN status = 'active' THEN COALESCE(expires_at, published_at + interval '30 days', now() + interval '30 days')
    ELSE expires_at
  END;

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_inventory_consistency;

ALTER TABLE listings
  ADD CONSTRAINT listings_inventory_consistency CHECK (
    (availability_status = 'service_available' AND available_quantity IS NULL)
    OR
    (
      availability_status <> 'service_available'
      AND available_quantity IS NOT NULL
      AND (
        (available_quantity = 0 AND availability_status = 'out_of_stock')
        OR
        (available_quantity > 0 AND availability_status IN ('in_stock', 'limited'))
      )
    )
  );

CREATE TABLE IF NOT EXISTS listing_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL UNIQUE REFERENCES offers(id) ON DELETE CASCADE,
  order_id uuid UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity IN (0, 1)),
  previous_availability_status text NOT NULL
    CHECK (previous_availability_status IN ('in_stock', 'limited', 'service_available')),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'released')),
  expires_at timestamptz,
  released_at timestamptz,
  release_reason text CHECK (release_reason IS NULL OR length(release_reason) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'reserved' AND released_at IS NULL AND release_reason IS NULL)
    OR (status = 'released' AND released_at IS NOT NULL AND release_reason IS NOT NULL)),
  CHECK (quantity = 0 OR previous_availability_status <> 'service_available')
);

CREATE INDEX IF NOT EXISTS listing_inventory_reservations_listing_idx
  ON listing_inventory_reservations(listing_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS listing_inventory_reservations_expiry_idx
  ON listing_inventory_reservations(expires_at)
  WHERE status = 'reserved' AND expires_at IS NOT NULL;

INSERT INTO listing_inventory_reservations (
  listing_id,
  offer_id,
  order_id,
  quantity,
  previous_availability_status,
  expires_at,
  created_at,
  updated_at
)
SELECT
  accepted.listing_id,
  accepted.id,
  orders.id,
  CASE WHEN listings.availability_status = 'service_available' THEN 0 ELSE 1 END,
  CASE WHEN listings.availability_status = 'service_available' THEN 'service_available' ELSE 'in_stock' END,
  CASE WHEN orders.id IS NULL THEN now() + interval '60 minutes' ELSE NULL END,
  accepted.updated_at,
  now()
FROM offers accepted
JOIN listings ON listings.id = accepted.listing_id
LEFT JOIN transactions orders ON orders.offer_id = accepted.id
WHERE accepted.status = 'accepted'
  AND listings.status = 'reserved'
ON CONFLICT (offer_id) DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_listing_inventory_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  listing_availability text;
BEGIN
  SELECT availability_status INTO listing_availability
  FROM listings
  WHERE id = NEW.listing_id;

  IF listing_availability = 'service_available' AND NEW.quantity <> 0 THEN
    RAISE EXCEPTION 'Service reservation quantity must be zero';
  END IF;

  IF listing_availability <> 'service_available' AND NEW.quantity <> 1 THEN
    RAISE EXCEPTION 'Finite inventory reservation quantity must be one';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listing_inventory_reservation_guard ON listing_inventory_reservations;
CREATE TRIGGER listing_inventory_reservation_guard
BEFORE INSERT OR UPDATE ON listing_inventory_reservations
FOR EACH ROW
EXECUTE FUNCTION enforce_listing_inventory_reservation();
