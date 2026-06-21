export type UserStatus = 'pending' | 'active' | 'suspended' | 'closed';
export type ListingStatus = 'draft' | 'active' | 'reserved' | 'sold' | 'expired' | 'removed';
export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair' | 'parts_or_repair';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired';
export type VerificationLevel = 'basic' | 'seller' | 'high_value_seller' | 'business';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'removed';

type TableShape = Record<string, any>;

export interface Database {
  users: TableShape;
  refresh_sessions: TableShape;
  verification_checks: TableShape;
  categories: TableShape;
  listings: TableShape;
  conversations: TableShape;
  messages: TableShape;
}
