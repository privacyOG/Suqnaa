export type UserStatus = 'pending' | 'active' | 'suspended' | 'closed';
export type ListingStatus = 'draft' | 'active' | 'reserved' | 'sold' | 'expired' | 'removed';
export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair' | 'parts_or_repair';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired';
export type VerificationLevel = 'basic' | 'seller' | 'high_value_seller' | 'business';

export interface UsersTable {
  id: string;
  email: string | null;
  phone_e164: string | null;
  display_name: string;
  password_hash: string | null;
  status: UserStatus;
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshSessionsTable {
  id: string;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface VerificationChecksTable {
  id: string;
  user_id: string;
  status: VerificationStatus;
  level: VerificationLevel;
  provider: string | null;
  reference: string | null;
  country_code: string | null;
  risk_score: number | null;
  reviewed_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CategoriesTable {
  id: string;
  parent_id: string | null;
  slug: string;
  name_en: string;
  name_ar: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
}

export interface ListingsTable {
  id: string;
  seller_id: string;
  category_id: string | null;
  title: string;
  description: string;
  price_amount: string;
  currency_code: string;
  condition: ListingCondition;
  status: ListingStatus;
  country_code: string;
  region: string | null;
  city: string | null;
  suburb: string | null;
  allow_pickup: boolean;
  allow_delivery: boolean;
  published_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Database {
  users: UsersTable;
  refresh_sessions: RefreshSessionsTable;
  verification_checks: VerificationChecksTable;
  categories: CategoriesTable;
  listings: ListingsTable;
}
