export type UserStatus = 'pending' | 'active' | 'suspended' | 'closed';
export type ListingStatus = 'draft' | 'active' | 'reserved' | 'sold' | 'expired' | 'removed';
export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair' | 'parts_or_repair';

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
  categories: CategoriesTable;
  listings: ListingsTable;
}
