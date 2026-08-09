INSERT INTO admin_permissions(permission_key, description) VALUES
  ('risk.read', 'Review marketplace risk signals and assessments.'),
  ('risk.manage', 'Manage marketplace risk detection rules.'),
  ('risk.review', 'Review and disposition marketplace risk signals without bypassing moderation or payment controls.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT roles.id, permissions.permission_key
FROM admin_roles roles
JOIN admin_permissions permissions ON permissions.permission_key IN (
  'risk.read', 'risk.manage', 'risk.review'
)
WHERE roles.role_key IN ('platform_admin', 'moderation_manager')
ON CONFLICT DO NOTHING;

CREATE TABLE risk_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL,
  score integer NOT NULL,
  window_seconds integer,
  threshold_count integer,
  threshold_amount numeric(18,2),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'operator',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_rules_key_check CHECK (rule_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  CONSTRAINT risk_rules_category_check CHECK (category IN (
    'account_abuse', 'offer_payment_fraud', 'account_takeover',
    'velocity_anomaly', 'duplicate_identity', 'suspicious_seller'
  )),
  CONSTRAINT risk_rules_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT risk_rules_score_check CHECK (score BETWEEN 1 AND 100),
  CONSTRAINT risk_rules_window_check CHECK (window_seconds IS NULL OR window_seconds BETWEEN 60 AND 2592000),
  CONSTRAINT risk_rules_count_check CHECK (threshold_count IS NULL OR threshold_count BETWEEN 1 AND 1000000),
  CONSTRAINT risk_rules_amount_check CHECK (threshold_amount IS NULL OR threshold_amount >= 0),
  CONSTRAINT risk_rules_config_check CHECK (jsonb_typeof(configuration) = 'object'),
  CONSTRAINT risk_rules_source_check CHECK (source IN ('system', 'operator')),
  CONSTRAINT risk_rules_actor_check CHECK (
    (source = 'system' AND created_by IS NULL AND updated_by IS NULL) OR
    (source = 'operator' AND created_by IS NOT NULL AND updated_by IS NOT NULL)
  )
);

CREATE INDEX risk_rules_active_category_idx ON risk_rules(category, severity, updated_at DESC) WHERE is_active;

INSERT INTO risk_rules(
  rule_key, category, title, description, severity, score,
  window_seconds, threshold_count, threshold_amount, configuration, source
) VALUES
  (
    'account.failed_login_velocity', 'account_abuse', 'Repeated failed sign-in attempts',
    'Flags a burst of failed sign-in attempts associated with the same account.',
    'medium', 55, 300, 8, NULL,
    '{"eventTypes":["account.login_failed"],"metric":"event_count"}'::jsonb, 'system'
  ),
  (
    'account.takeover_challenge_failures', 'account_takeover', 'Account takeover challenge failures',
    'Flags repeated security-challenge failures during sensitive account access.',
    'high', 80, 900, 3, NULL,
    '{"eventTypes":["account.challenge_failed"],"metric":"event_count"}'::jsonb, 'system'
  ),
  (
    'offer.buyer_velocity', 'velocity_anomaly', 'High buyer offer velocity',
    'Flags unusually rapid offer creation by one buyer account.',
    'medium', 60, 300, 8, NULL,
    '{"eventTypes":["offer.created"],"metric":"event_count"}'::jsonb, 'system'
  ),
  (
    'payment.failure_velocity', 'offer_payment_fraud', 'Repeated payment collection failures',
    'Flags repeated failed payment collection activity associated with an account or order.',
    'high', 75, 900, 5, NULL,
    '{"eventTypes":["payment.collection_failed"],"metric":"event_count"}'::jsonb, 'system'
  ),
  (
    'identity.shared_identifier', 'duplicate_identity', 'Identity identifier shared across accounts',
    'Flags a protected identity correlation value observed on multiple user accounts.',
    'critical', 90, 2592000, 2, NULL,
    '{"eventTypes":["identity.link_observed"],"metric":"distinct_accounts"}'::jsonb, 'system'
  ),
  (
    'seller.adverse_outcome_velocity', 'suspicious_seller', 'Repeated adverse seller outcomes',
    'Flags repeated chargeback, dispute, or protection outcomes associated with one seller.',
    'high', 80, 2592000, 3, NULL,
    '{"eventTypes":["seller.adverse_outcome"],"metric":"event_count"}'::jsonb, 'system'
  );

CREATE TABLE risk_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES risk_rules(id) ON DELETE SET NULL,
  rule_key text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  score integer NOT NULL,
  status text NOT NULL DEFAULT 'open',
  user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  listing_id uuid REFERENCES listings(id) ON DELETE RESTRICT,
  offer_id uuid REFERENCES offers(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES transactions(id) ON DELETE RESTRICT,
  payment_intent_id uuid REFERENCES payment_intents(id) ON DELETE RESTRICT,
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  source_event_type text NOT NULL,
  source_event_id text,
  fingerprint text,
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  review_disposition text,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_signals_key_check CHECK (rule_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  CONSTRAINT risk_signals_category_check CHECK (category IN (
    'account_abuse', 'offer_payment_fraud', 'account_takeover',
    'velocity_anomaly', 'duplicate_identity', 'suspicious_seller'
  )),
  CONSTRAINT risk_signals_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT risk_signals_score_check CHECK (score BETWEEN 1 AND 100),
  CONSTRAINT risk_signals_status_check CHECK (status IN ('open', 'reviewed', 'dismissed', 'escalated')),
  CONSTRAINT risk_signals_occurrence_check CHECK (occurrence_count >= 1),
  CONSTRAINT risk_signals_summary_check CHECK (char_length(btrim(summary)) BETWEEN 3 AND 2000),
  CONSTRAINT risk_signals_evidence_check CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT risk_signals_review_check CHECK (
    (status = 'open' AND reviewed_by IS NULL AND review_disposition IS NULL AND reviewed_at IS NULL) OR
    (status <> 'open' AND reviewed_by IS NOT NULL AND review_disposition IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT risk_signals_disposition_check CHECK (
    review_disposition IS NULL OR review_disposition IN ('confirmed', 'false_positive', 'monitor', 'escalated')
  ),
  CONSTRAINT risk_signals_note_check CHECK (review_note IS NULL OR char_length(btrim(review_note)) <= 4000)
);

CREATE INDEX risk_signals_open_score_idx ON risk_signals(status, score DESC, detected_at DESC);
CREATE INDEX risk_signals_user_idx ON risk_signals(user_id, detected_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX risk_signals_listing_idx ON risk_signals(listing_id, detected_at DESC) WHERE listing_id IS NOT NULL;
CREATE INDEX risk_signals_offer_idx ON risk_signals(offer_id, detected_at DESC) WHERE offer_id IS NOT NULL;
CREATE INDEX risk_signals_order_idx ON risk_signals(order_id, detected_at DESC) WHERE order_id IS NOT NULL;
CREATE INDEX risk_signals_payment_idx ON risk_signals(payment_intent_id, detected_at DESC) WHERE payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX risk_signals_source_unique
  ON risk_signals(rule_key, source_event_type, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX risk_signals_fingerprint_open_unique
  ON risk_signals(rule_key, fingerprint)
  WHERE fingerprint IS NOT NULL AND status = 'open';

CREATE TABLE risk_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_type text NOT NULL,
  identity_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT risk_identity_links_type_check CHECK (identity_type IN (
    'verification_subject', 'payout_account', 'payment_instrument', 'device', 'network'
  )),
  CONSTRAINT risk_identity_links_hash_check CHECK (char_length(identity_hash) BETWEEN 32 AND 128),
  CONSTRAINT risk_identity_links_source_check CHECK (char_length(btrim(source)) BETWEEN 2 AND 120),
  CONSTRAINT risk_identity_links_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE(identity_type, identity_hash, user_id)
);

CREATE INDEX risk_identity_links_hash_idx ON risk_identity_links(identity_type, identity_hash, last_seen_at DESC);
CREATE INDEX risk_identity_links_user_idx ON risk_identity_links(user_id, last_seen_at DESC);

-- Detection is intentionally separate from enforcement. No trigger in this migration
-- mutates users, listings, payment operations, payment intents, settlements, or payouts.
