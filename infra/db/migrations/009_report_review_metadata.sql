ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_action text,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS reports_open_created_idx ON reports(resolved_at, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_reviewed_by_idx ON reports(reviewed_by, updated_at DESC);
