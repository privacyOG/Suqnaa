ALTER TABLE transactions
  ADD COLUMN item_amount numeric(18,2),
  ADD COLUMN shipping_amount numeric(18,2) NOT NULL DEFAULT 0;

UPDATE transactions
SET item_amount = amount
WHERE item_amount IS NULL;

ALTER TABLE transactions
  ALTER COLUMN item_amount SET NOT NULL,
  ADD CONSTRAINT transactions_item_amount_check CHECK (item_amount >= 0),
  ADD CONSTRAINT transactions_shipping_amount_check CHECK (shipping_amount >= 0),
  ADD CONSTRAINT transactions_total_amount_check CHECK (
    round(item_amount + shipping_amount, 2) = round(amount, 2)
  );

ALTER TABLE fulfilments
  ADD COLUMN tracking_url text,
  ADD CONSTRAINT fulfilments_tracking_url_check CHECK (
    tracking_url IS NULL OR (
      tracking_url ~ '^https://' AND
      char_length(tracking_url) <= 1000
    )
  );

CREATE TABLE listing_shipping_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  label text NOT NULL,
  carrier text,
  service_code text,
  amount numeric(18,2) NOT NULL,
  currency_code char(3) NOT NULL,
  eta_min_days integer,
  eta_max_days integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_shipping_options_label_check CHECK (
    char_length(btrim(label)) BETWEEN 2 AND 80
  ),
  CONSTRAINT listing_shipping_options_carrier_check CHECK (
    carrier IS NULL OR char_length(btrim(carrier)) BETWEEN 2 AND 80
  ),
  CONSTRAINT listing_shipping_options_service_code_check CHECK (
    service_code IS NULL OR char_length(btrim(service_code)) BETWEEN 1 AND 80
  ),
  CONSTRAINT listing_shipping_options_amount_check CHECK (amount >= 0),
  CONSTRAINT listing_shipping_options_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT listing_shipping_options_eta_check CHECK (
    (eta_min_days IS NULL AND eta_max_days IS NULL) OR
    (
      eta_min_days BETWEEN 0 AND 60 AND
      eta_max_days BETWEEN eta_min_days AND 90
    )
  ),
  UNIQUE(listing_id, label)
);

CREATE INDEX listing_shipping_options_public_idx
  ON listing_shipping_options(listing_id, is_active, amount, id);

CREATE TABLE order_fulfilment_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  fulfilment_id uuid NOT NULL UNIQUE REFERENCES fulfilments(id) ON DELETE RESTRICT,
  mode text NOT NULL,
  shipping_option_id uuid REFERENCES listing_shipping_options(id) ON DELETE SET NULL,
  shipping_method_label text,
  shipping_carrier text,
  shipping_service_code text,
  shipping_amount numeric(18,2) NOT NULL DEFAULT 0,
  currency_code char(3) NOT NULL,
  recipient_name text,
  address_line1 text,
  address_line2 text,
  locality text,
  region text,
  postal_code text,
  country_code char(2),
  pickup_address_line1 text,
  pickup_address_line2 text,
  pickup_locality text,
  pickup_region text,
  pickup_postal_code text,
  pickup_country_code char(2),
  pickup_instructions text,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_fulfilment_details_mode_check CHECK (mode IN ('shipping', 'pickup')),
  CONSTRAINT order_fulfilment_details_amount_check CHECK (shipping_amount >= 0),
  CONSTRAINT order_fulfilment_details_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT order_fulfilment_details_shipping_label_check CHECK (
    shipping_method_label IS NULL OR char_length(btrim(shipping_method_label)) BETWEEN 2 AND 80
  ),
  CONSTRAINT order_fulfilment_details_shipping_carrier_check CHECK (
    shipping_carrier IS NULL OR char_length(btrim(shipping_carrier)) BETWEEN 2 AND 80
  ),
  CONSTRAINT order_fulfilment_details_recipient_check CHECK (
    recipient_name IS NULL OR char_length(btrim(recipient_name)) BETWEEN 2 AND 120
  ),
  CONSTRAINT order_fulfilment_details_address1_check CHECK (
    address_line1 IS NULL OR char_length(btrim(address_line1)) BETWEEN 3 AND 160
  ),
  CONSTRAINT order_fulfilment_details_address2_check CHECK (
    address_line2 IS NULL OR char_length(btrim(address_line2)) BETWEEN 1 AND 160
  ),
  CONSTRAINT order_fulfilment_details_locality_check CHECK (
    locality IS NULL OR char_length(btrim(locality)) BETWEEN 2 AND 100
  ),
  CONSTRAINT order_fulfilment_details_region_check CHECK (
    region IS NULL OR char_length(btrim(region)) BETWEEN 2 AND 80
  ),
  CONSTRAINT order_fulfilment_details_postal_check CHECK (
    postal_code IS NULL OR char_length(btrim(postal_code)) BETWEEN 3 AND 16
  ),
  CONSTRAINT order_fulfilment_details_country_check CHECK (
    country_code IS NULL OR country_code ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT order_fulfilment_details_pickup_address1_check CHECK (
    pickup_address_line1 IS NULL OR char_length(btrim(pickup_address_line1)) BETWEEN 3 AND 160
  ),
  CONSTRAINT order_fulfilment_details_pickup_address2_check CHECK (
    pickup_address_line2 IS NULL OR char_length(btrim(pickup_address_line2)) BETWEEN 1 AND 160
  ),
  CONSTRAINT order_fulfilment_details_pickup_locality_check CHECK (
    pickup_locality IS NULL OR char_length(btrim(pickup_locality)) BETWEEN 2 AND 100
  ),
  CONSTRAINT order_fulfilment_details_pickup_region_check CHECK (
    pickup_region IS NULL OR char_length(btrim(pickup_region)) BETWEEN 2 AND 80
  ),
  CONSTRAINT order_fulfilment_details_pickup_postal_check CHECK (
    pickup_postal_code IS NULL OR char_length(btrim(pickup_postal_code)) BETWEEN 3 AND 16
  ),
  CONSTRAINT order_fulfilment_details_pickup_country_check CHECK (
    pickup_country_code IS NULL OR pickup_country_code ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT order_fulfilment_details_pickup_instructions_check CHECK (
    pickup_instructions IS NULL OR char_length(pickup_instructions) <= 1000
  ),
  CONSTRAINT order_fulfilment_details_mode_fields_check CHECK (
    (
      mode = 'shipping' AND
      shipping_option_id IS NOT NULL AND
      shipping_method_label IS NOT NULL AND
      recipient_name IS NOT NULL AND
      address_line1 IS NOT NULL AND
      locality IS NOT NULL AND
      region IS NOT NULL AND
      postal_code IS NOT NULL AND
      country_code IS NOT NULL
    ) OR
    (
      mode = 'pickup' AND
      shipping_option_id IS NULL AND
      shipping_method_label IS NULL AND
      shipping_carrier IS NULL AND
      shipping_service_code IS NULL AND
      shipping_amount = 0 AND
      recipient_name IS NULL AND
      address_line1 IS NULL AND
      address_line2 IS NULL AND
      locality IS NULL AND
      region IS NULL AND
      postal_code IS NULL AND
      country_code IS NULL
    )
  )
);

CREATE INDEX order_fulfilment_details_mode_idx
  ON order_fulfilment_details(mode, updated_at DESC);

CREATE TABLE pickup_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  fulfilment_id uuid NOT NULL REFERENCES fulfilments(id) ON DELETE RESTRICT,
  code_hash char(64) NOT NULL,
  issued_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 20),
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  CONSTRAINT pickup_proofs_hash_check CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT pickup_proofs_expiry_check CHECK (expires_at > issued_at),
  CONSTRAINT pickup_proofs_verified_pair_check CHECK (
    (verified_at IS NULL AND verified_by IS NULL) OR
    (verified_at IS NOT NULL AND verified_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX pickup_proofs_active_idx
  ON pickup_proofs(order_id)
  WHERE verified_at IS NULL AND revoked_at IS NULL;
CREATE INDEX pickup_proofs_fulfilment_idx
  ON pickup_proofs(fulfilment_id, issued_at DESC);

CREATE TABLE order_fulfilment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  fulfilment_id uuid NOT NULL REFERENCES fulfilments(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL,
  reference text,
  evidence_url text,
  note text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_fulfilment_evidence_type_check CHECK (
    evidence_type IN ('tracking_declared', 'delivery_confirmation', 'pickup_proof_verified', 'participant_note')
  ),
  CONSTRAINT order_fulfilment_evidence_reference_check CHECK (
    reference IS NULL OR char_length(btrim(reference)) BETWEEN 1 AND 200
  ),
  CONSTRAINT order_fulfilment_evidence_url_check CHECK (
    evidence_url IS NULL OR (evidence_url ~ '^https://' AND char_length(evidence_url) <= 1000)
  ),
  CONSTRAINT order_fulfilment_evidence_note_check CHECK (
    note IS NULL OR char_length(note) <= 2000
  )
);

CREATE INDEX order_fulfilment_evidence_order_idx
  ON order_fulfilment_evidence(order_id, occurred_at, id);

CREATE TABLE order_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_key text NOT NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_timeline_events_key_check CHECK (
    event_key ~ '^[a-z0-9][a-z0-9_.:-]{2,159}$'
  ),
  CONSTRAINT order_timeline_events_type_check CHECK (
    event_type IN (
      'order_created',
      'delivery_selected',
      'pickup_selected',
      'payment_received',
      'pickup_details_set',
      'ready_for_pickup',
      'pickup_proof_issued',
      'pickup_completed',
      'shipped',
      'delivered',
      'received_confirmed',
      'delivery_evidence_added'
    )
  ),
  CONSTRAINT order_timeline_events_details_check CHECK (jsonb_typeof(details) = 'object'),
  UNIQUE(order_id, event_key)
);

CREATE INDEX order_timeline_events_order_idx
  ON order_timeline_events(order_id, occurred_at, id);

CREATE OR REPLACE FUNCTION guard_pending_order_price_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.amount IS NOT DISTINCT FROM NEW.amount AND
     OLD.item_amount IS NOT DISTINCT FROM NEW.item_amount AND
     OLD.shipping_amount IS NOT DISTINCT FROM NEW.shipping_amount THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending'::transaction_status OR NEW.status <> 'pending'::transaction_status THEN
    RAISE EXCEPTION 'Order price may only change while payment is pending';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM payment_intents payment_intent
    JOIN payment_collection_sessions collection_session
      ON collection_session.payment_intent_id = payment_intent.id
    WHERE payment_intent.transaction_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Order price cannot change after payment collection begins';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_guard_pending_price_changes
BEFORE UPDATE OF amount, item_amount, shipping_amount ON transactions
FOR EACH ROW
EXECUTE FUNCTION guard_pending_order_price_changes();

CREATE OR REPLACE FUNCTION sync_order_payment_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE payment_intents
  SET amount = NEW.amount,
      updated_at = NEW.updated_at
  WHERE transaction_id = NEW.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order payment context is missing for transaction %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_sync_order_payment_amount
AFTER UPDATE OF amount ON transactions
FOR EACH ROW
WHEN (OLD.amount IS DISTINCT FROM NEW.amount)
EXECUTE FUNCTION sync_order_payment_amount();

INSERT INTO order_timeline_events(order_id, actor_id, event_key, event_type, details, occurred_at)
SELECT id, buyer_id, 'order.created', 'order_created', '{}'::jsonb, created_at
FROM transactions
ON CONFLICT (order_id, event_key) DO NOTHING;

INSERT INTO order_timeline_events(order_id, actor_id, event_key, event_type, details, occurred_at)
SELECT transaction.id, NULL, 'payment.received', 'payment_received', '{}'::jsonb, transaction.updated_at
FROM transactions transaction
WHERE transaction.status IN ('paid', 'released', 'refunded', 'disputed')
ON CONFLICT (order_id, event_key) DO NOTHING;

INSERT INTO order_timeline_events(order_id, actor_id, event_key, event_type, details, occurred_at)
SELECT payment_intent.transaction_id, payment_intent.seller_id, 'fulfilment.shipped', 'shipped',
       jsonb_build_object('carrier', fulfilment.carrier), fulfilment.shipped_at
FROM fulfilments fulfilment
JOIN payment_intents payment_intent ON payment_intent.id = fulfilment.payment_intent_id
WHERE fulfilment.shipped_at IS NOT NULL AND payment_intent.transaction_id IS NOT NULL
ON CONFLICT (order_id, event_key) DO NOTHING;

INSERT INTO order_timeline_events(order_id, actor_id, event_key, event_type, details, occurred_at)
SELECT payment_intent.transaction_id, payment_intent.buyer_id, 'fulfilment.received', 'received_confirmed',
       '{}'::jsonb, fulfilment.buyer_confirmed_at
FROM fulfilments fulfilment
JOIN payment_intents payment_intent ON payment_intent.id = fulfilment.payment_intent_id
WHERE fulfilment.buyer_confirmed_at IS NOT NULL AND payment_intent.transaction_id IS NOT NULL
ON CONFLICT (order_id, event_key) DO NOTHING;
