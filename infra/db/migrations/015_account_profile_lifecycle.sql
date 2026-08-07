ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS business_website text,
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS show_city boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_country boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_business_details boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_avatar boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS avatar_mime_type text,
  ADD COLUMN IF NOT EXISTS avatar_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS avatar_sha256 char(64);

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_visibility_check
  CHECK (profile_visibility IN ('public', 'private'));

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_business_website_length_check
  CHECK (business_website IS NULL OR length(business_website) <= 300);

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_business_description_length_check
  CHECK (business_description IS NULL OR length(business_description) <= 1000);

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_avatar_mime_type_check
  CHECK (
    avatar_mime_type IS NULL OR
    avatar_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  );

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_avatar_size_check
  CHECK (avatar_size_bytes IS NULL OR (avatar_size_bytes > 0 AND avatar_size_bytes <= 2097152));

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_avatar_metadata_consistency_check
  CHECK (
    (avatar_object_key IS NULL AND avatar_mime_type IS NULL AND avatar_size_bytes IS NULL AND avatar_sha256 IS NULL)
    OR
    (avatar_object_key IS NOT NULL AND avatar_mime_type IS NOT NULL AND avatar_size_bytes IS NOT NULL AND avatar_sha256 IS NOT NULL)
  );

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_closure_timestamps_check
  CHECK (
    (status <> 'closed'::user_status OR closed_at IS NOT NULL)
    AND (deletion_requested_at IS NULL OR closed_at IS NOT NULL)
    AND (anonymized_at IS NULL OR deletion_requested_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS users_closed_at_idx
  ON users(closed_at)
  WHERE closed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_deletion_requested_at_idx
  ON users(deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;
