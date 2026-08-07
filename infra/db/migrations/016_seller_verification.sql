ALTER TABLE verification_checks
  ADD COLUMN IF NOT EXISTS provider_result text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_provider_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS subject_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE verification_checks
  ADD CONSTRAINT verification_checks_provider_result_check
  CHECK (provider_result IN ('pending', 'passed', 'failed', 'review_required', 'expired'));

ALTER TABLE verification_checks
  ADD CONSTRAINT verification_checks_review_note_length_check
  CHECK (review_note IS NULL OR length(review_note) <= 2000);

ALTER TABLE verification_checks
  ADD CONSTRAINT verification_checks_reason_code_length_check
  CHECK (reason_code IS NULL OR length(reason_code) <= 120);

ALTER TABLE verification_checks
  ADD CONSTRAINT verification_checks_subject_snapshot_check
  CHECK (jsonb_typeof(subject_snapshot) = 'object');

CREATE INDEX IF NOT EXISTS verification_checks_operations_idx
  ON verification_checks(status, provider_result, updated_at DESC);

CREATE INDEX IF NOT EXISTS verification_checks_verified_expiry_idx
  ON verification_checks(expires_at)
  WHERE status = 'verified';

CREATE INDEX IF NOT EXISTS verification_checks_provider_reference_idx
  ON verification_checks(provider, reference)
  WHERE provider IS NOT NULL AND reference IS NOT NULL;

CREATE TABLE verification_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  verification_check_id uuid NOT NULL REFERENCES verification_checks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  provider_reference text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX verification_provider_events_check_idx
  ON verification_provider_events(verification_check_id, received_at DESC);
