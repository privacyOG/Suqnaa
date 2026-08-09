INSERT INTO admin_permissions(permission_key, description) VALUES
  ('moderation.policy.manage', 'Manage prohibited-item/category policy rules and moderation retention settings.'),
  ('moderation.appeal.review', 'Review appeals against moderation actions.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT roles.id, permissions.permission_key
FROM admin_roles roles
JOIN admin_permissions permissions ON permissions.permission_key IN (
  'moderation.policy.manage', 'moderation.appeal.review'
)
WHERE roles.role_key IN ('platform_admin', 'moderation_manager')
ON CONFLICT DO NOTHING;

CREATE TABLE moderation_policy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  pattern text,
  action text NOT NULL,
  reason_code text NOT NULL,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_policy_rules_scope_check CHECK (scope IN ('category', 'listing_text')),
  CONSTRAINT moderation_policy_rules_action_check CHECK (action IN ('block', 'manual_review')),
  CONSTRAINT moderation_policy_rules_target_check CHECK (
    (scope = 'category' AND category_id IS NOT NULL AND pattern IS NULL) OR
    (scope = 'listing_text' AND category_id IS NULL AND pattern IS NOT NULL)
  ),
  CONSTRAINT moderation_policy_rules_pattern_check CHECK (
    pattern IS NULL OR char_length(btrim(pattern)) BETWEEN 2 AND 200
  ),
  CONSTRAINT moderation_policy_rules_reason_check CHECK (reason_code ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  CONSTRAINT moderation_policy_rules_note_check CHECK (note IS NULL OR char_length(btrim(note)) <= 2000)
);

CREATE INDEX moderation_policy_rules_active_scope_idx
  ON moderation_policy_rules(scope, is_active, updated_at DESC);
CREATE UNIQUE INDEX moderation_policy_rules_active_category_unique
  ON moderation_policy_rules(category_id)
  WHERE scope = 'category' AND is_active;

CREATE TABLE moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES listings(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  action_type text NOT NULL,
  reason_code text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  acted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reversed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reversed_at timestamptz,
  reversal_reason text,
  evidence_retain_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_actions_subject_check CHECK (
    (listing_id IS NOT NULL AND user_id IS NULL) OR
    (listing_id IS NULL AND user_id IS NOT NULL)
  ),
  CONSTRAINT moderation_actions_type_check CHECK (
    action_type IN ('listing_approve', 'listing_takedown', 'account_suspend', 'account_close', 'no_action')
  ),
  CONSTRAINT moderation_actions_status_check CHECK (status IN ('active', 'reversed', 'superseded')),
  CONSTRAINT moderation_actions_reason_code_check CHECK (reason_code ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  CONSTRAINT moderation_actions_reason_check CHECK (char_length(btrim(reason)) BETWEEN 8 AND 4000),
  CONSTRAINT moderation_actions_reversal_check CHECK (
    (status = 'reversed' AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL) OR
    (status <> 'reversed' AND reversed_by IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL)
  ),
  CONSTRAINT moderation_actions_retention_check CHECK (evidence_retain_until > created_at)
);

CREATE INDEX moderation_actions_listing_idx ON moderation_actions(listing_id, created_at DESC) WHERE listing_id IS NOT NULL;
CREATE INDEX moderation_actions_user_idx ON moderation_actions(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX moderation_actions_report_idx ON moderation_actions(report_id, created_at DESC) WHERE report_id IS NOT NULL;
CREATE INDEX moderation_actions_retention_idx ON moderation_actions(evidence_retain_until, status);

CREATE TABLE moderation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_action_id uuid NOT NULL REFERENCES moderation_actions(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_notes_note_check CHECK (char_length(btrim(note)) BETWEEN 1 AND 4000)
);

CREATE INDEX moderation_notes_action_idx ON moderation_notes(moderation_action_id, created_at, id);

CREATE TABLE moderation_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_action_id uuid NOT NULL REFERENCES moderation_actions(id) ON DELETE RESTRICT,
  appellant_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open',
  reason text NOT NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  decision text,
  decision_note text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_appeals_status_check CHECK (status IN ('open', 'upheld', 'overturned', 'dismissed')),
  CONSTRAINT moderation_appeals_reason_check CHECK (char_length(btrim(reason)) BETWEEN 8 AND 4000),
  CONSTRAINT moderation_appeals_decision_check CHECK (
    (status = 'open' AND reviewed_by IS NULL AND decision IS NULL AND decision_note IS NULL AND decided_at IS NULL) OR
    (status <> 'open' AND reviewed_by IS NOT NULL AND decision IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT moderation_appeals_decision_value_check CHECK (decision IS NULL OR decision IN ('uphold', 'overturn', 'dismiss')),
  CONSTRAINT moderation_appeals_decision_note_check CHECK (decision_note IS NULL OR char_length(btrim(decision_note)) BETWEEN 8 AND 4000)
);

CREATE UNIQUE INDEX moderation_appeals_open_action_unique
  ON moderation_appeals(moderation_action_id)
  WHERE status = 'open';
CREATE INDEX moderation_appeals_status_idx ON moderation_appeals(status, opened_at DESC);
