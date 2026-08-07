CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  requested_ip inet,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX password_reset_tokens_user_created_idx
  ON password_reset_tokens(user_id, created_at DESC);

CREATE INDEX password_reset_tokens_active_idx
  ON password_reset_tokens(user_id, expires_at)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX refresh_sessions_user_active_idx
  ON refresh_sessions(user_id, created_at DESC)
  WHERE revoked_at IS NULL;
