CREATE TABLE saved_listings (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE INDEX saved_listings_user_created_idx
  ON saved_listings(user_id, created_at DESC, listing_id);

CREATE TABLE listing_watchlist (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE INDEX listing_watchlist_user_created_idx
  ON listing_watchlist(user_id, created_at DESC, listing_id);

CREATE TABLE recently_viewed_listings (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  view_count integer NOT NULL DEFAULT 1 CHECK (view_count >= 1),
  PRIMARY KEY (user_id, listing_id),
  CHECK (last_viewed_at >= first_viewed_at)
);

CREATE INDEX recently_viewed_listings_user_last_idx
  ON recently_viewed_listings(user_id, last_viewed_at DESC, listing_id);

CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  filters jsonb NOT NULL CHECK (jsonb_typeof(filters) = 'object'),
  filter_fingerprint char(32) NOT NULL CHECK (filter_fingerprint ~ '^[a-f0-9]{32}$'),
  is_active boolean NOT NULL DEFAULT true,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  last_evaluated_listing_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, filter_fingerprint)
);

CREATE INDEX saved_searches_active_scan_idx
  ON saved_searches(last_evaluated_at, id)
  WHERE is_active = true;

CREATE INDEX saved_searches_user_updated_idx
  ON saved_searches(user_id, updated_at DESC, id);

CREATE TABLE saved_search_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_search_id uuid NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  listing_edit_version integer NOT NULL CHECK (listing_edit_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (saved_search_id, listing_id),
  CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX saved_search_notifications_user_unread_idx
  ON saved_search_notifications(user_id, created_at DESC, id)
  WHERE read_at IS NULL;

CREATE INDEX saved_search_notifications_user_created_idx
  ON saved_search_notifications(user_id, created_at DESC, id);
