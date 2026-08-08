CREATE OR REPLACE FUNCTION snapshot_order_shipping_eta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  option_eta_min integer;
  option_eta_max integer;
BEGIN
  IF NEW.mode = 'pickup' THEN
    NEW.shipping_eta_min_days := NULL;
    NEW.shipping_eta_max_days := NULL;
    RETURN NEW;
  END IF;

  IF NEW.shipping_option_id IS NULL THEN
    NEW.shipping_eta_min_days := NULL;
    NEW.shipping_eta_max_days := NULL;
    RETURN NEW;
  END IF;

  SELECT shipping_option.eta_min_days, shipping_option.eta_max_days
  INTO option_eta_min, option_eta_max
  FROM listing_shipping_options shipping_option
  WHERE shipping_option.id = NEW.shipping_option_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected shipping option is unavailable for ETA snapshot';
  END IF;

  NEW.shipping_eta_min_days := option_eta_min;
  NEW.shipping_eta_max_days := option_eta_max;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_fulfilment_details_snapshot_shipping_eta
BEFORE INSERT OR UPDATE OF shipping_option_id, mode
ON order_fulfilment_details
FOR EACH ROW
EXECUTE FUNCTION snapshot_order_shipping_eta();

UPDATE order_fulfilment_details details
SET shipping_eta_min_days = shipping_option.eta_min_days,
    shipping_eta_max_days = shipping_option.eta_max_days
FROM listing_shipping_options shipping_option
WHERE details.mode = 'shipping'
  AND details.shipping_option_id = shipping_option.id;
