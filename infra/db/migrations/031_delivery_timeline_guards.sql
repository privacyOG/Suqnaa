CREATE OR REPLACE FUNCTION initialize_order_price_breakdown()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.item_amount IS NULL THEN
    NEW.item_amount := NEW.amount;
  END IF;
  IF NEW.shipping_amount IS NULL THEN
    NEW.shipping_amount := 0;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_initialize_price_breakdown
BEFORE INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION initialize_order_price_breakdown();

CREATE OR REPLACE FUNCTION append_order_created_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO order_timeline_events(
    order_id, actor_id, event_key, event_type, details, occurred_at, created_at
  ) VALUES (
    NEW.id, NEW.buyer_id, 'order.created', 'order_created', '{}'::jsonb, NEW.created_at, NEW.created_at
  )
  ON CONFLICT (order_id, event_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_append_created_timeline
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION append_order_created_timeline();

CREATE OR REPLACE FUNCTION append_order_payment_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'pending'::transaction_status AND NEW.status = 'paid'::transaction_status THEN
    INSERT INTO order_timeline_events(
      order_id, actor_id, event_key, event_type, details, occurred_at, created_at
    ) VALUES (
      NEW.id, NULL, 'payment.received', 'payment_received', '{}'::jsonb, NEW.updated_at, NEW.updated_at
    )
    ON CONFLICT (order_id, event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_append_payment_timeline
AFTER UPDATE OF status ON transactions
FOR EACH ROW
EXECUTE FUNCTION append_order_payment_timeline();
