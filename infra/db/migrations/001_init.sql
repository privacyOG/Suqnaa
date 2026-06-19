CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE listing_status AS ENUM ('draft', 'active', 'reserved', 'sold', 'expired', 'removed');
CREATE TYPE listing_condition AS ENUM ('new', 'like_new', 'good', 'fair', 'parts_or_repair');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'cancelled');
CREATE TYPE transaction_status AS ENUM ('pending', 'paid', 'released', 'refunded', 'disputed', 'cancelled');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  phone_e164 text UNIQUE,
  display_name text NOT NULL,
  password_hash text,
  status user_status NOT NULL DEFAULT 'pending',
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);

CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_object_key text,
  bio text,
  city text,
  country_code char(2),
  trust_score integer NOT NULL DEFAULT 0 CHECK (trust_score >= 0 AND trust_score <= 100),
  is_business boolean NOT NULL DEFAULT false,
  business_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address inet,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  price_amount numeric(12,2) NOT NULL CHECK (price_amount >= 0),
  currency_code char(3) NOT NULL,
  condition listing_condition NOT NULL,
  status listing_status NOT NULL DEFAULT 'draft',
  country_code char(2) NOT NULL,
  region text,
  city text,
  suburb text,
  location geography(Point, 4326),
  allow_pickup boolean NOT NULL DEFAULT true,
  allow_delivery boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX listings_seller_id_idx ON listings(seller_id);
CREATE INDEX listings_category_id_idx ON listings(category_id);
CREATE INDEX listings_status_created_at_idx ON listings(status, created_at DESC);
CREATE INDEX listings_location_idx ON listings USING GIST(location);
CREATE INDEX listings_title_search_idx ON listings USING GIN(to_tsvector('simple', title || ' ' || description));

CREATE TABLE listing_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  mime_type text NOT NULL,
  width integer,
  height integer,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer_id <> seller_id)
);

CREATE INDEX conversations_buyer_id_idx ON conversations(buyer_id);
CREATE INDEX conversations_seller_id_idx ON conversations(seller_id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX messages_conversation_created_idx ON messages(conversation_id, created_at DESC);

CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency_code char(3) NOT NULL,
  status offer_status NOT NULL DEFAULT 'pending',
  message text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  offer_id uuid REFERENCES offers(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency_code char(3) NOT NULL,
  status transaction_status NOT NULL DEFAULT 'pending',
  payment_provider text,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer_id <> seller_id)
);

CREATE INDEX transactions_buyer_id_idx ON transactions(buyer_id);
CREATE INDEX transactions_seller_id_idx ON transactions(seller_id);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (listing_id IS NOT NULL OR reported_user_id IS NOT NULL)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  ip_address inet,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
