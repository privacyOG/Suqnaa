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
  transaction.id,
  transaction.buyer_id,
  transaction.seller_id,
  transaction.listing_id,
  NULL,
  NULL,
  CASE transaction.payment_method
    WHEN 'card' THEN 'card'
    WHEN 'bank_transfer' THEN 'bank_transfer'
    WHEN 'wallet' THEN 'wallet'
    WHEN 'xmr' THEN 'crypto_xmr'
  END::payment_rail,
  CASE transaction.status
    WHEN 'pending' THEN 'created'
    WHEN 'paid' THEN 'held'
    WHEN 'released' THEN 'released'
    WHEN 'refunded' THEN 'refunded'
    WHEN 'disputed' THEN 'disputed'
    WHEN 'cancelled' THEN 'cancelled'
  END::payment_status,
  transaction.amount,
  transaction.currency_code,
  NULL,
  NULL,
  NULL,
  transaction.created_at,
  transaction.updated_at
FROM transactions AS transaction
WHERE transaction.payment_method IN ('card', 'bank_transfer', 'wallet', 'xmr')
  AND transaction.payment_provider IS NULL
  AND transaction.payment_reference IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM payment_intents AS existing
    WHERE existing.transaction_id = transaction.id
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
