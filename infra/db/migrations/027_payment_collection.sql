CREATE TABLE payment_collection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_session_id text NOT NULL,
  provider_payment_reference text,
  status text NOT NULL DEFAULT 'open',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_collection_sessions_provider_check CHECK (
    provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$'
  ),
  CONSTRAINT payment_collection_sessions_session_check CHECK (
    provider_session_id ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{1,254}$'
  ),
  CONSTRAINT payment_collection_sessions_payment_reference_check CHECK (
    provider_payment_reference IS NULL OR
    provider_payment_reference ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{1,254}$'
  ),
  CONSTRAINT payment_collection_sessions_status_check CHECK (
    status IN ('open', 'completed', 'expired')
  ),
  CONSTRAINT payment_collection_sessions_intent_unique UNIQUE (payment_intent_id),
  CONSTRAINT payment_collection_sessions_provider_session_unique UNIQUE (
    provider,
    provider_session_id
  )
);

CREATE INDEX payment_collection_sessions_expiry_idx
  ON payment_collection_sessions(status, expires_at)
  WHERE status = 'open';

CREATE TABLE payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_payment_reference text NOT NULL,
  provider_charge_reference text NOT NULL,
  receipt_url text,
  receipt_number text,
  issued_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_receipts_provider_check CHECK (
    provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$'
  ),
  CONSTRAINT payment_receipts_payment_reference_check CHECK (
    provider_payment_reference ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{1,254}$'
  ),
  CONSTRAINT payment_receipts_charge_reference_check CHECK (
    provider_charge_reference ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{1,254}$'
  ),
  CONSTRAINT payment_receipts_url_check CHECK (
    receipt_url IS NULL OR receipt_url ~ '^https://'
  ),
  CONSTRAINT payment_receipts_number_check CHECK (
    receipt_number IS NULL OR char_length(receipt_number) <= 120
  ),
  CONSTRAINT payment_receipts_intent_unique UNIQUE (payment_intent_id),
  CONSTRAINT payment_receipts_provider_charge_unique UNIQUE (
    provider,
    provider_charge_reference
  )
);

CREATE INDEX payment_receipts_issued_idx
  ON payment_receipts(issued_at DESC);
