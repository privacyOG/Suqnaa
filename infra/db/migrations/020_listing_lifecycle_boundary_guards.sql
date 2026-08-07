CREATE OR REPLACE FUNCTION enforce_listing_lifecycle_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  previous_status text;
BEGIN
  previous_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status::text END;

  IF NEW.availability_status = 'service_available' THEN
    NEW.available_quantity := NULL;
  ELSE
    IF NEW.available_quantity IS NULL THEN
      NEW.available_quantity := 1;
    END IF;
    IF NEW.available_quantity = 0 THEN
      NEW.availability_status := 'out_of_stock';
    ELSIF NEW.availability_status = 'out_of_stock' THEN
      NEW.availability_status := 'in_stock';
    END IF;
  END IF;

  IF NEW.status = 'sold' AND NEW.availability_status <> 'service_available' THEN
    NEW.available_quantity := 0;
    NEW.availability_status := 'out_of_stock';
  END IF;

  IF NEW.status = 'active' THEN
    IF NEW.availability_status <> 'service_available' AND COALESCE(NEW.available_quantity, 0) <= 0 THEN
      IF previous_status = 'active' THEN
        NEW.status := 'reserved';
      ELSE
        RAISE EXCEPTION 'Listing cannot be activated without available inventory';
      END IF;
    END IF;

    IF NEW.status = 'active' AND TG_OP = 'INSERT' THEN
      NEW.published_at := COALESCE(NEW.published_at, now());
      NEW.expires_at := COALESCE(NEW.expires_at, now() + interval '30 days');
    ELSIF NEW.status = 'active' AND previous_status = 'draft' THEN
      NEW.published_at := COALESCE(NEW.published_at, now());
      NEW.expires_at := COALESCE(NEW.expires_at, now() + interval '30 days');
    ELSIF NEW.status = 'active' AND previous_status = 'expired' THEN
      NEW.published_at := COALESCE(NEW.published_at, now());
      NEW.expires_at := COALESCE(NEW.expires_at, now() + interval '30 days');
      NEW.last_renewed_at := COALESCE(NEW.last_renewed_at, now());
    ELSIF NEW.status = 'active'
      AND previous_status = 'reserved'
      AND OLD.expires_at IS NOT NULL
      AND OLD.expires_at <= now() THEN
      NEW.status := 'expired';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attach_inventory_reservation_on_order_create()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.offer_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE listing_inventory_reservations
  SET order_id = NEW.id, expires_at = NULL, updated_at = now()
  WHERE offer_id = NEW.offer_id
    AND status = 'reserved'
    AND order_id IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted offer inventory reservation is unavailable or expired';
  END IF;

  RETURN NEW;
END;
$$;
