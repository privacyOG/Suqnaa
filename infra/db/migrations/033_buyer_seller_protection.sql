CREATE TABLE order_protection_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL UNIQUE REFERENCES disputes(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  claimant_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  respondent_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  beneficiary_role text NOT NULL,
  claim_type text NOT NULL,
  policy_version text NOT NULL,
  eligibility_basis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_protection_cases_participants_check CHECK (claimant_user_id <> respondent_user_id),
  CONSTRAINT order_protection_cases_role_check CHECK (beneficiary_role IN ('buyer', 'seller')),
  CONSTRAINT order_protection_cases_type_check CHECK (
    claim_type IN (
      'non_delivery',
      'item_not_as_described',
      'post_payment_cancellation',
      'return_request',
      'return_not_received',
      'returned_item_condition'
    )
  ),
  CONSTRAINT order_protection_cases_policy_check CHECK (
    char_length(btrim(policy_version)) BETWEEN 3 AND 80
  ),
  CONSTRAINT order_protection_cases_eligibility_check CHECK (jsonb_typeof(eligibility_basis) = 'object')
);

CREATE INDEX order_protection_cases_order_idx
  ON order_protection_cases(order_id, created_at DESC);
CREATE INDEX order_protection_cases_claimant_idx
  ON order_protection_cases(claimant_user_id, created_at DESC);

CREATE TABLE order_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protection_case_id uuid NOT NULL UNIQUE REFERENCES order_protection_cases(id) ON DELETE RESTRICT,
  dispute_id uuid NOT NULL UNIQUE REFERENCES disputes(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'authorized',
  reason text NOT NULL,
  authorized_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  return_due_at timestamptz NOT NULL,
  carrier text,
  tracking_reference text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  received_at timestamptz,
  received_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  seller_condition text,
  seller_condition_note text,
  seller_response_due_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT order_returns_participants_check CHECK (buyer_id <> seller_id),
  CONSTRAINT order_returns_status_check CHECK (
    status IN (
      'authorized', 'awaiting_shipment', 'in_transit', 'delivered',
      'received', 'contested', 'completed', 'cancelled', 'expired'
    )
  ),
  CONSTRAINT order_returns_reason_check CHECK (char_length(btrim(reason)) BETWEEN 8 AND 4000),
  CONSTRAINT order_returns_carrier_check CHECK (
    carrier IS NULL OR char_length(btrim(carrier)) BETWEEN 2 AND 80
  ),
  CONSTRAINT order_returns_tracking_reference_check CHECK (
    tracking_reference IS NULL OR char_length(btrim(tracking_reference)) BETWEEN 2 AND 200
  ),
  CONSTRAINT order_returns_tracking_url_check CHECK (
    tracking_url IS NULL OR (tracking_url ~ '^https://' AND char_length(tracking_url) <= 1000)
  ),
  CONSTRAINT order_returns_tracking_pair_check CHECK (
    (tracking_reference IS NULL AND tracking_url IS NULL) OR tracking_reference IS NOT NULL
  ),
  CONSTRAINT order_returns_shipped_check CHECK (
    shipped_at IS NULL OR shipped_at <= COALESCE(delivered_at, received_at, shipped_at)
  ),
  CONSTRAINT order_returns_delivered_check CHECK (
    delivered_at IS NULL OR shipped_at IS NOT NULL
  ),
  CONSTRAINT order_returns_received_pair_check CHECK (
    (received_at IS NULL AND received_by_user_id IS NULL) OR
    (received_at IS NOT NULL AND received_by_user_id IS NOT NULL)
  ),
  CONSTRAINT order_returns_received_sequence_check CHECK (
    received_at IS NULL OR delivered_at IS NULL OR received_at >= delivered_at
  ),
  CONSTRAINT order_returns_seller_condition_check CHECK (
    seller_condition IS NULL OR seller_condition IN ('accepted', 'contested')
  ),
  CONSTRAINT order_returns_seller_condition_note_check CHECK (
    seller_condition_note IS NULL OR char_length(btrim(seller_condition_note)) BETWEEN 8 AND 4000
  ),
  CONSTRAINT order_returns_completion_pair_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR
    (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT order_returns_cancellation_pair_check CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL) OR
    (status <> 'cancelled' AND cancelled_at IS NULL)
  ),
  CONSTRAINT order_returns_version_check CHECK (version > 0)
);

CREATE INDEX order_returns_status_due_idx
  ON order_returns(status, return_due_at, seller_response_due_at)
  WHERE status IN ('authorized', 'awaiting_shipment', 'in_transit', 'delivered', 'received', 'contested');
CREATE INDEX order_returns_order_idx ON order_returns(order_id, created_at DESC);

CREATE TABLE protection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protection_case_id uuid NOT NULL REFERENCES order_protection_cases(id) ON DELETE CASCADE,
  return_id uuid REFERENCES order_returns(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protection_events_type_check CHECK (
    event_type IN (
      'claim_opened', 'return_authorized', 'return_shipped', 'return_delivered',
      'return_received', 'return_contested', 'return_completed', 'return_cancelled',
      'return_expired', 'refund_requested', 'release_requested', 'protection_denied',
      'protection_escalated'
    )
  ),
  CONSTRAINT protection_events_details_check CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX protection_events_case_idx
  ON protection_events(protection_case_id, occurred_at, id);

ALTER TABLE order_fulfilment_details
  ADD COLUMN shipping_eta_min_days integer,
  ADD COLUMN shipping_eta_max_days integer,
  ADD CONSTRAINT order_fulfilment_details_eta_check CHECK (
    (shipping_eta_min_days IS NULL AND shipping_eta_max_days IS NULL) OR
    (
      shipping_eta_min_days BETWEEN 0 AND 60 AND
      shipping_eta_max_days BETWEEN shipping_eta_min_days AND 90
    )
  );

UPDATE order_fulfilment_details details
SET shipping_eta_min_days = option.eta_min_days,
    shipping_eta_max_days = option.eta_max_days
FROM listing_shipping_options option
WHERE details.shipping_option_id = option.id
  AND details.mode = 'shipping';

CREATE OR REPLACE FUNCTION suqnaa_dispute_blocks_settlement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('scheduled', 'processing') AND (
    EXISTS (
      SELECT 1
      FROM disputes dispute
      WHERE dispute.order_id = NEW.order_id
        AND dispute.status IN ('opened', 'awaiting_buyer', 'awaiting_seller', 'under_review')
    ) OR EXISTS (
      SELECT 1
      FROM order_returns return_row
      WHERE return_row.order_id = NEW.order_id
        AND return_row.status IN (
          'authorized', 'awaiting_shipment', 'in_transit', 'delivered', 'received', 'contested'
        )
    )
  ) THEN
    NEW.status := 'blocked';
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION suqnaa_block_settlement_for_active_return()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('authorized', 'awaiting_shipment', 'in_transit', 'delivered', 'received', 'contested') THEN
    UPDATE seller_settlements
    SET status = 'blocked', updated_at = now()
    WHERE order_id = NEW.order_id
      AND status IN ('scheduled', 'failed');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER return_blocks_existing_settlement
AFTER INSERT OR UPDATE OF status ON order_returns
FOR EACH ROW
EXECUTE FUNCTION suqnaa_block_settlement_for_active_return();
