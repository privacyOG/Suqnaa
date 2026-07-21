CREATE TABLE payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  provider_reference text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL,
  processing_result text NOT NULL,
  CONSTRAINT payment_provider_events_provider_check CHECK (
    provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$'
  ),
  CONSTRAINT payment_provider_events_event_id_check CHECK (
    provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  ),
  CONSTRAINT payment_provider_events_type_check CHECK (
    event_type = 'payment.held'
  ),
  CONSTRAINT payment_provider_events_reference_check CHECK (
    provider_reference ~ '^[!-~]{1,200}$'
  ),
  CONSTRAINT payment_provider_events_fingerprint_check CHECK (
    payload_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT payment_provider_events_result_check CHECK (
    processing_result IN ('processed', 'unchanged')
  ),
  CONSTRAINT payment_provider_events_provider_id_unique UNIQUE (
    provider,
    provider_event_id
  )
);

CREATE INDEX payment_provider_events_intent_idx
  ON payment_provider_events(payment_intent_id, received_at DESC);

CREATE INDEX payment_provider_events_received_idx
  ON payment_provider_events(received_at DESC);
