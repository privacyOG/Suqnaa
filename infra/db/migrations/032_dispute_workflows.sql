INSERT INTO admin_permissions(permission_key, description) VALUES
  ('disputes.read', 'Read protected marketplace dispute cases and evidence.'),
  ('disputes.review', 'Review dispute cases, request participant responses, and record case decisions.'),
  ('disputes.resolve', 'Resolve or escalate dispute cases and initiate separately authorised payment operations.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO admin_roles(role_key, display_name, description, is_system) VALUES
  ('dispute_manager', 'Dispute manager', 'Protected marketplace dispute review and resolution.', true)
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT role.id, permission.permission_key
FROM admin_roles role
JOIN admin_permissions permission ON permission.permission_key IN (
  'operations.access', 'disputes.read', 'disputes.review', 'disputes.resolve'
)
WHERE role.role_key IN ('platform_admin', 'dispute_manager')
ON CONFLICT DO NOTHING;

ALTER TABLE disputes
  ADD COLUMN order_id uuid REFERENCES transactions(id) ON DELETE RESTRICT,
  ADD COLUMN respondent_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN category text,
  ADD COLUMN opened_by_role text,
  ADD COLUMN response_due_at timestamptz,
  ADD COLUMN review_due_at timestamptz,
  ADD COLUMN assigned_to_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN resolved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN resolution_payment_operation_id uuid REFERENCES payment_operations(id) ON DELETE RESTRICT,
  ADD COLUMN appeal_deadline_at timestamptz,
  ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN escalation_reason text,
  ADD COLUMN version integer NOT NULL DEFAULT 1;

UPDATE disputes dispute
SET order_id = payment_intent.transaction_id,
    respondent_user_id = CASE
      WHEN dispute.opened_by_user_id = payment_intent.buyer_id THEN payment_intent.seller_id
      ELSE payment_intent.buyer_id
    END,
    opened_by_role = CASE
      WHEN dispute.opened_by_user_id = payment_intent.buyer_id THEN 'buyer'
      ELSE 'seller'
    END,
    category = 'other',
    response_due_at = dispute.opened_at + interval '5 days',
    review_due_at = dispute.opened_at + interval '10 days',
    last_activity_at = dispute.updated_at
FROM payment_intents payment_intent
WHERE payment_intent.id = dispute.payment_intent_id
  AND payment_intent.transaction_id IS NOT NULL;

ALTER TABLE disputes
  ALTER COLUMN order_id SET NOT NULL,
  ALTER COLUMN respondent_user_id SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN opened_by_role SET NOT NULL,
  ALTER COLUMN response_due_at SET NOT NULL,
  ALTER COLUMN review_due_at SET NOT NULL,
  ADD CONSTRAINT disputes_participants_check CHECK (opened_by_user_id <> respondent_user_id),
  ADD CONSTRAINT disputes_role_check CHECK (opened_by_role IN ('buyer', 'seller')),
  ADD CONSTRAINT disputes_category_check CHECK (
    category IN ('non_delivery', 'item_condition', 'damage', 'pickup_issue', 'payment_issue', 'other')
  ),
  ADD CONSTRAINT disputes_deadline_check CHECK (review_due_at >= response_due_at),
  ADD CONSTRAINT disputes_appeal_deadline_check CHECK (
    appeal_deadline_at IS NULL OR resolved_at IS NULL OR appeal_deadline_at >= resolved_at
  ),
  ADD CONSTRAINT disputes_escalation_level_check CHECK (escalation_level BETWEEN 0 AND 3),
  ADD CONSTRAINT disputes_escalation_reason_check CHECK (
    escalation_reason IS NULL OR char_length(btrim(escalation_reason)) BETWEEN 8 AND 2000
  ),
  ADD CONSTRAINT disputes_version_check CHECK (version > 0);

CREATE INDEX disputes_order_idx ON disputes(order_id, opened_at DESC);
CREATE INDEX disputes_participant_idx ON disputes(opened_by_user_id, respondent_user_id, opened_at DESC);
CREATE INDEX disputes_deadline_idx ON disputes(status, response_due_at, review_due_at);
CREATE INDEX disputes_assignment_idx ON disputes(assigned_to_user_id, status, last_activity_at);
CREATE UNIQUE INDEX disputes_one_active_per_payment_idx
  ON disputes(payment_intent_id)
  WHERE status IN ('opened', 'awaiting_buyer', 'awaiting_seller', 'under_review');

ALTER TABLE dispute_evidence
  ADD COLUMN filename text,
  ADD COLUMN mime_type text,
  ADD COLUMN size_bytes integer,
  ADD COLUMN sha256 char(64),
  ADD COLUMN note text,
  ADD COLUMN removed_at timestamptz,
  ADD CONSTRAINT dispute_evidence_filename_check CHECK (
    filename IS NULL OR char_length(btrim(filename)) BETWEEN 1 AND 180
  ),
  ADD CONSTRAINT dispute_evidence_mime_check CHECK (
    mime_type IS NULL OR mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  ADD CONSTRAINT dispute_evidence_size_check CHECK (
    size_bytes IS NULL OR size_bytes BETWEEN 1 AND 10485760
  ),
  ADD CONSTRAINT dispute_evidence_sha_check CHECK (
    sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'
  ),
  ADD CONSTRAINT dispute_evidence_note_check CHECK (
    note IS NULL OR char_length(note) <= 2000
  ),
  ADD CONSTRAINT dispute_evidence_content_check CHECK (
    (object_key IS NOT NULL AND mime_type IS NOT NULL AND size_bytes IS NOT NULL AND sha256 IS NOT NULL) OR
    (object_key IS NULL AND text_value IS NOT NULL)
  );

CREATE INDEX dispute_evidence_active_idx
  ON dispute_evidence(dispute_id, created_at, id)
  WHERE removed_at IS NULL;

CREATE TABLE dispute_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  submitted_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  response_text text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispute_responses_text_check CHECK (
    char_length(btrim(response_text)) BETWEEN 10 AND 6000
  )
);

CREATE INDEX dispute_responses_case_idx
  ON dispute_responses(dispute_id, submitted_at, id);

CREATE TABLE dispute_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL UNIQUE REFERENCES disputes(id) ON DELETE CASCADE,
  opened_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  decision_notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispute_appeals_reason_check CHECK (char_length(btrim(reason)) BETWEEN 20 AND 4000),
  CONSTRAINT dispute_appeals_status_check CHECK (
    status IN ('pending', 'under_review', 'upheld', 'changed', 'rejected', 'escalated')
  ),
  CONSTRAINT dispute_appeals_notes_check CHECK (
    decision_notes IS NULL OR char_length(decision_notes) BETWEEN 8 AND 4000
  ),
  CONSTRAINT dispute_appeals_decision_pair_check CHECK (
    (decided_at IS NULL AND decided_by_user_id IS NULL) OR
    (decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL)
  )
);

CREATE INDEX dispute_appeals_review_idx
  ON dispute_appeals(status, opened_at)
  WHERE status IN ('pending', 'under_review', 'escalated');

CREATE TABLE dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispute_events_type_check CHECK (
    event_type IN (
      'opened', 'response_submitted', 'evidence_added', 'response_overdue',
      'review_started', 'more_information_requested', 'resolved', 'closed',
      'appealed', 'appeal_review_started', 'appeal_decided', 'escalated'
    )
  ),
  CONSTRAINT dispute_events_details_check CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX dispute_events_case_idx
  ON dispute_events(dispute_id, occurred_at, id);

CREATE OR REPLACE FUNCTION suqnaa_dispute_blocks_settlement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('scheduled', 'processing') AND EXISTS (
    SELECT 1
    FROM disputes dispute
    WHERE dispute.order_id = NEW.order_id
      AND dispute.status IN ('opened', 'awaiting_buyer', 'awaiting_seller', 'under_review')
  ) THEN
    NEW.status := 'blocked';
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER seller_settlement_dispute_guard
BEFORE INSERT OR UPDATE OF status ON seller_settlements
FOR EACH ROW
EXECUTE FUNCTION suqnaa_dispute_blocks_settlement();

CREATE OR REPLACE FUNCTION suqnaa_block_settlement_for_active_dispute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('opened', 'awaiting_buyer', 'awaiting_seller', 'under_review') THEN
    UPDATE seller_settlements
    SET status = 'blocked', updated_at = now()
    WHERE order_id = NEW.order_id
      AND status IN ('scheduled', 'failed');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispute_blocks_existing_settlement
AFTER INSERT OR UPDATE OF status ON disputes
FOR EACH ROW
EXECUTE FUNCTION suqnaa_block_settlement_for_active_dispute();
