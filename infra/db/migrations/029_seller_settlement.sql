INSERT INTO admin_permissions(permission_key, description) VALUES
  ('settlements.read', 'Read protected seller settlement, payout, and reconciliation records.'),
  ('settlements.run', 'Run and retry protected seller settlement and transfer reconciliation.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT role.id, permission.permission_key
FROM admin_roles role
JOIN admin_permissions permission ON permission.permission_key IN (
  'operations.access', 'settlements.read', 'settlements.run'
)
WHERE role.role_key IN ('platform_admin', 'payment_manager')
ON CONFLICT DO NOTHING;

CREATE TABLE seller_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'stripe',
  provider_account_reference text NOT NULL UNIQUE,
  country_code char(2) NOT NULL,
  default_currency char(3) NOT NULL,
  onboarding_status text NOT NULL DEFAULT 'onboarding',
  transfers_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  requirements_due integer NOT NULL DEFAULT 0 CHECK (requirements_due >= 0),
  disabled_reason text,
  payout_interval text NOT NULL DEFAULT 'weekly',
  payout_anchor text NOT NULL DEFAULT 'monday',
  last_provider_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_payout_accounts_provider_check CHECK (provider = 'stripe'),
  CONSTRAINT seller_payout_accounts_country_check CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT seller_payout_accounts_currency_check CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT seller_payout_accounts_status_check CHECK (onboarding_status IN ('onboarding', 'restricted', 'ready', 'disabled')),
  CONSTRAINT seller_payout_accounts_reference_check CHECK (provider_account_reference ~ '^acct_[A-Za-z0-9_]{8,}$'),
  CONSTRAINT seller_payout_accounts_interval_check CHECK (payout_interval IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT seller_payout_accounts_anchor_check CHECK (char_length(payout_anchor) BETWEEN 1 AND 16)
);

CREATE INDEX seller_payout_accounts_status_idx
  ON seller_payout_accounts(onboarding_status, updated_at);

CREATE TABLE seller_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  payment_intent_id uuid NOT NULL UNIQUE REFERENCES payment_intents(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payout_account_id uuid REFERENCES seller_payout_accounts(id) ON DELETE RESTRICT,
  gross_amount numeric(18,2) NOT NULL CHECK (gross_amount >= 0),
  commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 5000),
  commission_amount numeric(18,2) NOT NULL CHECK (commission_amount >= 0),
  net_amount numeric(18,2) NOT NULL CHECK (net_amount >= 0),
  currency_code char(3) NOT NULL,
  status text NOT NULL DEFAULT 'blocked',
  source_charge_reference text NOT NULL,
  provider_transfer_reference text UNIQUE,
  transfer_idempotency_key text NOT NULL UNIQUE,
  available_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  failure_code text,
  transferred_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_settlements_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT seller_settlements_status_check CHECK (status IN ('blocked', 'scheduled', 'processing', 'transferred', 'partially_reversed', 'reversed', 'failed')),
  CONSTRAINT seller_settlements_amount_balance_check CHECK (round(commission_amount + net_amount, 2) = round(gross_amount, 2)),
  CONSTRAINT seller_settlements_charge_reference_check CHECK (source_charge_reference ~ '^ch_[A-Za-z0-9_]{8,}$'),
  CONSTRAINT seller_settlements_transfer_reference_check CHECK (provider_transfer_reference IS NULL OR provider_transfer_reference ~ '^tr_[A-Za-z0-9_]{8,}$'),
  CONSTRAINT seller_settlements_idempotency_check CHECK (transfer_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,254}$'),
  CONSTRAINT seller_settlements_failure_check CHECK (failure_code IS NULL OR failure_code ~ '^[a-z0-9][a-z0-9_-]{2,79}$')
);

CREATE INDEX seller_settlements_due_idx
  ON seller_settlements(status, available_at)
  WHERE status IN ('blocked', 'scheduled', 'failed');
CREATE INDEX seller_settlements_seller_idx
  ON seller_settlements(seller_id, created_at DESC);

CREATE TABLE settlement_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES seller_settlements(id) ON DELETE RESTRICT,
  payment_operation_id uuid REFERENCES payment_operations(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_reversal_reference text UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  failure_code text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_reversals_kind_check CHECK (kind IN ('refund', 'chargeback')),
  CONSTRAINT settlement_reversals_status_check CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  CONSTRAINT settlement_reversals_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT settlement_reversals_reference_check CHECK (provider_reversal_reference IS NULL OR provider_reversal_reference ~ '^trr_[A-Za-z0-9_]{8,}$'),
  CONSTRAINT settlement_reversals_idempotency_check CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,254}$'),
  CONSTRAINT settlement_reversals_failure_check CHECK (failure_code IS NULL OR failure_code ~ '^[a-z0-9][a-z0-9_-]{2,79}$')
);

CREATE UNIQUE INDEX settlement_reversals_payment_operation_idx
  ON settlement_reversals(payment_operation_id)
  WHERE payment_operation_id IS NOT NULL;
CREATE INDEX settlement_reversals_due_idx
  ON settlement_reversals(status, created_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE settlement_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES seller_settlements(id) ON DELETE RESTRICT,
  reversal_id uuid REFERENCES settlement_reversals(id) ON DELETE RESTRICT,
  entry_type text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount <> 0),
  currency_code char(3) NOT NULL,
  reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_ledger_entry_type_check CHECK (entry_type IN ('gross_sale', 'platform_commission', 'seller_payable', 'seller_transfer', 'refund_adjustment', 'commission_adjustment', 'transfer_reversal', 'payout_failure')),
  CONSTRAINT settlement_ledger_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT settlement_ledger_reference_check CHECK (char_length(reference) BETWEEN 8 AND 255)
);

CREATE INDEX settlement_ledger_settlement_idx
  ON settlement_ledger_entries(settlement_id, created_at, id);

CREATE TABLE seller_payout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_account_id uuid NOT NULL REFERENCES seller_payout_accounts(id) ON DELETE RESTRICT,
  provider_event_id text NOT NULL UNIQUE,
  provider_payout_reference text,
  event_type text NOT NULL,
  amount numeric(18,2),
  currency_code char(3),
  status text,
  failure_code text,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_payout_events_event_check CHECK (event_type IN ('account.updated', 'payout.paid', 'payout.failed', 'payout.canceled', 'transfer.reversed')),
  CONSTRAINT seller_payout_events_currency_check CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT seller_payout_events_amount_check CHECK (amount IS NULL OR amount >= 0)
);

CREATE INDEX seller_payout_events_account_idx
  ON seller_payout_events(payout_account_id, occurred_at DESC);
