ALTER TABLE payment_intents
  ADD COLUMN transaction_id uuid REFERENCES transactions(id) ON DELETE RESTRICT;

ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_transaction_source_check
  CHECK (
    transaction_id IS NULL OR
    (auction_id IS NULL AND winning_bid_id IS NULL)
  );

CREATE UNIQUE INDEX payment_intents_transaction_idx
  ON payment_intents(transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX fulfilments_payment_intent_unique_idx
  ON fulfilments(payment_intent_id);

INSERT INTO payment_intents (
  transaction_id,
  buyer_id,
  seller_id,
  listing_id,
  auction_id,
  winning_bid_id,
  rail,
  status,
  amount,
  currency_code,
  provider,
  provider_reference,
  expires_at,
  created_at,
  updated_at
)
SELECT
  market_order.id,
  market_order.buyer_id,
  market_order.seller_id,
  market_order.listing_id,
  NULL,
  NULL,
  CASE market_order.payment_method
    WHEN 'card' THEN 'card'
    WHEN 'bank_transfer' THEN 'bank_transfer'
    WHEN 'wallet' THEN 'wallet'
    WHEN 'xmr' THEN 'crypto_xmr'
  END::payment_rail,
  CASE market_order.status
    WHEN 'pending' THEN 'created'
    WHEN 'paid' THEN 'held'
    WHEN 'released' THEN 'released'
    WHEN 'refunded' THEN 'refunded'
    WHEN 'disputed' THEN 'disputed'
    WHEN 'cancelled' THEN 'cancelled'
  END::payment_status,
  market_order.amount,
  market_order.currency_code,
  NULL,
  NULL,
  NULL,
  market_order.created_at,
  market_order.updated_at
FROM transactions AS market_order
WHERE market_order.payment_method IN ('card', 'bank_transfer', 'wallet', 'xmr')
  AND market_order.payment_provider IS NULL
  AND market_order.payment_reference IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM payment_intents AS existing
    WHERE existing.transaction_id = market_order.id
  )
ON CONFLICT DO NOTHING;

INSERT INTO fulfilments (
  payment_intent_id,
  status,
  created_at,
  updated_at
)
SELECT
  payment_intent.id,
  'not_started',
  payment_intent.created_at,
  payment_intent.updated_at
FROM payment_intents AS payment_intent
WHERE payment_intent.transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM fulfilments AS existing
    WHERE existing.payment_intent_id = payment_intent.id
  )
ON CONFLICT DO NOTHING;

CREATE FUNCTION create_order_payment_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  created_payment_intent_id uuid;
BEGIN
  INSERT INTO payment_intents (
    transaction_id,
    buyer_id,
    seller_id,
    listing_id,
    auction_id,
    winning_bid_id,
    rail,
    status,
    amount,
    currency_code,
    provider,
    provider_reference,
    expires_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.buyer_id,
    NEW.seller_id,
    NEW.listing_id,
    NULL,
    NULL,
    CASE NEW.payment_method
      WHEN 'card' THEN 'card'
      WHEN 'bank_transfer' THEN 'bank_transfer'
      WHEN 'wallet' THEN 'wallet'
      WHEN 'xmr' THEN 'crypto_xmr'
    END::payment_rail,
    CASE NEW.status
      WHEN 'pending' THEN 'created'
      WHEN 'paid' THEN 'held'
      WHEN 'released' THEN 'released'
      WHEN 'refunded' THEN 'refunded'
      WHEN 'disputed' THEN 'disputed'
      WHEN 'cancelled' THEN 'cancelled'
    END::payment_status,
    NEW.amount,
    NEW.currency_code,
    NEW.payment_provider,
    NEW.payment_reference,
    NULL,
    NEW.created_at,
    NEW.updated_at
  )
  RETURNING id INTO created_payment_intent_id;

  INSERT INTO fulfilments (
    payment_intent_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    created_payment_intent_id,
    'not_started',
    NEW.created_at,
    NEW.updated_at
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_create_order_payment_context
AFTER INSERT ON transactions
FOR EACH ROW
WHEN (NEW.payment_method IN ('card', 'bank_transfer', 'wallet', 'xmr'))
EXECUTE FUNCTION create_order_payment_context();

CREATE FUNCTION sync_order_payment_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE payment_intents
  SET
    status = CASE NEW.status
      WHEN 'pending' THEN 'created'
      WHEN 'paid' THEN 'held'
      WHEN 'released' THEN 'released'
      WHEN 'refunded' THEN 'refunded'
      WHEN 'disputed' THEN 'disputed'
      WHEN 'cancelled' THEN 'cancelled'
    END::payment_status,
    provider = NEW.payment_provider,
    provider_reference = NEW.payment_reference,
    updated_at = NEW.updated_at
  WHERE transaction_id = NEW.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order payment context is missing for transaction %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_sync_order_payment_context
AFTER UPDATE OF status, payment_provider, payment_reference ON transactions
FOR EACH ROW
WHEN (
  NEW.payment_method IN ('card', 'bank_transfer', 'wallet', 'xmr') AND
  (
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.payment_provider IS DISTINCT FROM NEW.payment_provider OR
    OLD.payment_reference IS DISTINCT FROM NEW.payment_reference
  )
)
EXECUTE FUNCTION sync_order_payment_context();
