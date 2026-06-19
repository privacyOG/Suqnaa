CREATE TYPE verification_status AS ENUM ('unverified', 'pending', 'verified', 'rejected', 'expired');
CREATE TYPE auction_status AS ENUM ('draft', 'scheduled', 'live', 'ended', 'cancelled', 'settled');
CREATE TYPE bid_status AS ENUM ('active', 'outbid', 'winning', 'cancelled', 'invalid');
CREATE TYPE payment_rail AS ENUM ('card', 'bank_transfer', 'wallet', 'crypto_xmr', 'crypto_other');
CREATE TYPE payment_status AS ENUM ('created', 'awaiting_payment', 'funds_received', 'held', 'released', 'refunded', 'disputed', 'cancelled', 'compliance_hold');
CREATE TYPE dispute_status AS ENUM ('opened', 'awaiting_buyer', 'awaiting_seller', 'under_review', 'resolved', 'closed');
CREATE TYPE dispute_outcome AS ENUM ('none', 'buyer_refund', 'seller_release', 'partial_refund', 'return_required', 'compliance_escalation');
CREATE TYPE fulfilment_status AS ENUM ('not_started', 'ready_for_pickup', 'shipped', 'delivered', 'received_confirmed', 'failed');

CREATE TABLE verification_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status verification_status NOT NULL DEFAULT 'pending',
  level text NOT NULL,
  provider text,
  reference text,
  country_code char(2),
  risk_score integer CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX verification_checks_user_idx ON verification_checks(user_id, created_at DESC);

CREATE TABLE auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL UNIQUE REFERENCES listings(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status auction_status NOT NULL DEFAULT 'draft',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  starting_price numeric(12,2) NOT NULL CHECK (starting_price >= 0),
  reserve_price numeric(12,2) CHECK (reserve_price IS NULL OR reserve_price >= 0),
  bid_increment numeric(12,2) NOT NULL DEFAULT 1.00 CHECK (bid_increment > 0),
  anti_sniping_window_seconds integer NOT NULL DEFAULT 120 CHECK (anti_sniping_window_seconds >= 0),
  winning_bid_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX auctions_status_time_idx ON auctions(status, starts_at, ends_at);
CREATE INDEX auctions_seller_idx ON auctions(seller_id, created_at DESC);

CREATE TABLE bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency_code char(3) NOT NULL,
  status bid_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bids_auction_amount_idx ON bids(auction_id, amount DESC, created_at ASC);
CREATE INDEX bids_bidder_idx ON bids(bidder_id, created_at DESC);

ALTER TABLE auctions
  ADD CONSTRAINT auctions_winning_bid_fk FOREIGN KEY (winning_bid_id) REFERENCES bids(id) ON DELETE SET NULL;

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  listing_id uuid REFERENCES listings(id) ON DELETE RESTRICT,
  auction_id uuid REFERENCES auctions(id) ON DELETE SET NULL,
  winning_bid_id uuid REFERENCES bids(id) ON DELETE SET NULL,
  rail payment_rail NOT NULL,
  status payment_status NOT NULL DEFAULT 'created',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency_code char(3) NOT NULL,
  provider text,
  provider_reference text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer_id <> seller_id)
);

CREATE INDEX payment_intents_buyer_idx ON payment_intents(buyer_id, created_at DESC);
CREATE INDEX payment_intents_seller_idx ON payment_intents(seller_id, created_at DESC);
CREATE INDEX payment_intents_status_idx ON payment_intents(status, created_at DESC);

CREATE TABLE crypto_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  currency_code char(3) NOT NULL DEFAULT 'XMR',
  expected_amount numeric(24,12) NOT NULL CHECK (expected_amount > 0),
  address text,
  payment_id text,
  confirmations_required integer NOT NULL DEFAULT 10 CHECK (confirmations_required >= 0),
  confirmations_seen integer NOT NULL DEFAULT 0 CHECK (confirmations_seen >= 0),
  tx_hash text,
  expires_at timestamptz NOT NULL,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crypto_payment_requests_intent_idx ON crypto_payment_requests(payment_intent_id);
CREATE INDEX crypto_payment_requests_tx_idx ON crypto_payment_requests(tx_hash);

CREATE TABLE fulfilments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  status fulfilment_status NOT NULL DEFAULT 'not_started',
  carrier text,
  tracking_reference text,
  pickup_code_hash text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  buyer_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fulfilments_payment_idx ON fulfilments(payment_intent_id);

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  opened_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status dispute_status NOT NULL DEFAULT 'opened',
  outcome dispute_outcome NOT NULL DEFAULT 'none',
  reason text NOT NULL,
  summary text,
  resolution_notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX disputes_payment_idx ON disputes(payment_intent_id);
CREATE INDEX disputes_status_idx ON disputes(status, opened_at DESC);

CREATE TABLE dispute_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  submitted_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL,
  object_key text,
  text_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dispute_evidence_dispute_idx ON dispute_evidence(dispute_id, created_at ASC);
