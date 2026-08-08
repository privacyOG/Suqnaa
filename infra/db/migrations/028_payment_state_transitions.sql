INSERT INTO admin_permissions(permission_key, description) VALUES
  ('payments.read', 'Read protected payment operation and transition records.'),
  ('payments.request', 'Request protected payment release, refund, cancellation, and compliance-hold operations.'),
  ('payments.approve', 'Approve or reject protected payment operations requested by another authorised user.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO admin_roles(role_key, display_name, description, is_system) VALUES
  ('payment_manager', 'Payment manager', 'Protected payment operation review and two-person approval.', true)
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT role.id, permission.permission_key
FROM admin_roles role
JOIN admin_permissions permission ON permission.permission_key IN (
  'operations.access', 'payments.read', 'payments.request', 'payments.approve'
)
WHERE role.role_key IN ('platform_admin', 'payment_manager')
ON CONFLICT DO NOTHING;

CREATE TABLE payment_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  source text NOT NULL DEFAULT 'operations',
  status text NOT NULL DEFAULT 'requested',
  amount numeric(18,2),
  currency_code char(3) NOT NULL,
  reason text NOT NULL,
  requested_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  provider_reference text,
  idempotency_key text NOT NULL UNIQUE,
  error_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_operations_kind_check CHECK (
    kind IN (
      'release', 'refund_full', 'refund_partial', 'cancel_after_payment',
      'chargeback', 'compliance_hold'
    )
  ),
  CONSTRAINT payment_operations_source_check CHECK (source IN ('operations', 'provider')),
  CONSTRAINT payment_operations_status_check CHECK (
    status IN ('requested', 'approved', 'processing', 'succeeded', 'failed', 'rejected')
  ),
  CONSTRAINT payment_operations_amount_check CHECK (amount IS NULL OR amount > 0),
  CONSTRAINT payment_operations_reason_check CHECK (char_length(reason) BETWEEN 8 AND 2000),
  CONSTRAINT payment_operations_provider_reference_check CHECK (
    provider_reference IS NULL OR
    provider_reference ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{1,254}$'
  ),
  CONSTRAINT payment_operations_idempotency_check CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,254}$'
  ),
  CONSTRAINT payment_operations_error_check CHECK (
    error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9_-]{2,79}$'
  ),
  CONSTRAINT payment_operations_approval_separation_check CHECK (
    approved_by IS NULL OR requested_by IS NULL OR approved_by <> requested_by
  ),
  CONSTRAINT payment_operations_source_actor_check CHECK (
    (source = 'operations' AND requested_by IS NOT NULL) OR
    (source = 'provider' AND requested_by IS NULL)
  )
);

CREATE INDEX payment_operations_order_idx
  ON payment_operations(order_id, requested_at DESC);
CREATE INDEX payment_operations_intent_idx
  ON payment_operations(payment_intent_id, requested_at DESC);
CREATE INDEX payment_operations_review_idx
  ON payment_operations(status, requested_at)
  WHERE status IN ('requested', 'approved', 'processing');

CREATE UNIQUE INDEX payment_operations_single_release_idx
  ON payment_operations(payment_intent_id)
  WHERE kind = 'release' AND status IN ('requested', 'approved', 'processing', 'succeeded');

CREATE UNIQUE INDEX payment_operations_active_hold_idx
  ON payment_operations(payment_intent_id)
  WHERE kind = 'compliance_hold' AND status IN ('requested', 'approved', 'processing');
