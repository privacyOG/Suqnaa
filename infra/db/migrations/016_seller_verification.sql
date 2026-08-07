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

ALTER TABLE verification_checks
  ADD CONSTRAINT verification_checks_no_self_review_check
  CHECK (reviewed_by IS NULL OR reviewed_by <> user_id);

CREATE INDEX IF NOT EXISTS verification_checks_operations_idx
  ON verification_checks(status, provider_result, updated_at DESC);

CREATE INDEX IF NOT EXISTS verification_checks_verified_expiry_idx
  ON verification_checks(expires_at)
  WHERE status = 'verified';

CREATE UNIQUE INDEX IF NOT EXISTS verification_checks_provider_reference_idx
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

CREATE OR REPLACE FUNCTION enforce_seller_verification_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_status user_status;
  current_is_business boolean;
  current_business_name text;
BEGIN
  IF NEW.status <> 'verified' THEN
    RETURN NEW;
  END IF;

  IF NEW.level NOT IN ('seller', 'business') THEN
    RAISE EXCEPTION 'Only seller or business checks may become verified';
  END IF;

  SELECT status INTO account_status
  FROM users
  WHERE id = NEW.user_id;

  IF account_status IS DISTINCT FROM 'active'::user_status THEN
    RAISE EXCEPTION 'Verification subject account must be active';
  END IF;

  IF NEW.provider_result NOT IN ('passed', 'review_required') THEN
    RAISE EXCEPTION 'Provider result does not permit verification approval';
  END IF;

  IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.verified_at IS NULL OR NEW.expires_at IS NULL THEN
    RAISE EXCEPTION 'Verified checks require reviewer, review time, verification time, and expiry';
  END IF;

  IF NEW.expires_at <= NEW.verified_at THEN
    RAISE EXCEPTION 'Verification expiry must be after verification time';
  END IF;

  IF NEW.provider_result = 'review_required' AND NULLIF(btrim(NEW.review_note), '') IS NULL THEN
    RAISE EXCEPTION 'Manual approval requires a review note';
  END IF;

  IF NEW.level = 'business' THEN
    SELECT is_business, business_name
      INTO current_is_business, current_business_name
    FROM user_profiles
    WHERE user_id = NEW.user_id;

    IF current_is_business IS DISTINCT FROM true OR
       NULLIF(btrim(current_business_name), '') IS NULL OR
       NEW.subject_snapshot->>'businessName' IS DISTINCT FROM btrim(current_business_name) THEN
      RAISE EXCEPTION 'Business verification subject changed before approval';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verification_checks_approval_guard ON verification_checks;
CREATE TRIGGER verification_checks_approval_guard
BEFORE INSERT OR UPDATE ON verification_checks
FOR EACH ROW
EXECUTE FUNCTION enforce_seller_verification_approval();
