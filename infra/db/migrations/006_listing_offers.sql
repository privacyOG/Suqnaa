ALTER TABLE offers
  ADD COLUMN client_offer_id uuid;

CREATE UNIQUE INDEX offers_buyer_client_id_idx
  ON offers(buyer_id, client_offer_id)
  WHERE client_offer_id IS NOT NULL;

CREATE INDEX offers_listing_status_created_idx
  ON offers(listing_id, status, created_at DESC);

WITH ranked_pending AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY buyer_id, listing_id
      ORDER BY created_at DESC, id DESC
    ) AS position
  FROM offers
  WHERE status = 'pending'
)
UPDATE offers
SET
  status = 'cancelled',
  updated_at = now()
FROM ranked_pending
WHERE offers.id = ranked_pending.id
  AND ranked_pending.position > 1;

CREATE UNIQUE INDEX offers_pending_buyer_listing_idx
  ON offers(buyer_id, listing_id)
  WHERE status = 'pending';
