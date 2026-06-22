ALTER TABLE transactions
  ADD COLUMN client_order_id uuid,
  ADD COLUMN payment_method text;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_payment_method_check
  CHECK (
    payment_method IS NULL OR
    payment_method IN ('card', 'bank_transfer', 'wallet', 'xmr')
  );

WITH ranked_accepted AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY listing_id
      ORDER BY updated_at DESC, id DESC
    ) AS position
  FROM offers
  WHERE status = 'accepted'
)
UPDATE offers
SET
  status = 'rejected',
  updated_at = now()
FROM ranked_accepted
WHERE offers.id = ranked_accepted.id
  AND ranked_accepted.position > 1;

CREATE UNIQUE INDEX offers_accepted_listing_idx
  ON offers(listing_id)
  WHERE status = 'accepted';

WITH ranked_orders AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY offer_id
      ORDER BY created_at ASC, id ASC
    ) AS position
  FROM transactions
  WHERE offer_id IS NOT NULL
)
UPDATE transactions
SET
  offer_id = NULL,
  status = 'cancelled',
  updated_at = now()
FROM ranked_orders
WHERE transactions.id = ranked_orders.id
  AND ranked_orders.position > 1;

CREATE UNIQUE INDEX transactions_offer_id_idx
  ON transactions(offer_id)
  WHERE offer_id IS NOT NULL;

CREATE UNIQUE INDEX transactions_buyer_client_order_idx
  ON transactions(buyer_id, client_order_id)
  WHERE client_order_id IS NOT NULL;

CREATE INDEX transactions_listing_status_created_idx
  ON transactions(listing_id, status, created_at DESC);
