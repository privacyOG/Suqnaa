export type UserStatus = 'pending' | 'active' | 'suspended' | 'closed';
export type ListingStatus = 'draft' | 'active' | 'reserved' | 'sold' | 'expired' | 'removed';
export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair' | 'parts_or_repair';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired';
export type VerificationLevel = 'basic' | 'seller' | 'high_value_seller' | 'business';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'removed';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
export type TransactionStatus = 'pending' | 'paid' | 'released' | 'refunded' | 'disputed' | 'cancelled';

export type PaymentRail = 'card' | 'bank_transfer' | 'wallet' | 'crypto_xmr' | 'crypto_other';
export type PaymentStatus =
  | 'created'
  | 'awaiting_payment'
  | 'funds_received'
  | 'held'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'cancelled'
  | 'compliance_hold';
export type FulfilmentStatus =
  | 'not_started'
  | 'ready_for_pickup'
  | 'shipped'
  | 'delivered'
  | 'received_confirmed'
  | 'failed';

type TableShape = Record<string, any>;

export interface Database {
  users: TableShape;
  user_profiles: TableShape;
  refresh_sessions: TableShape;
  verification_checks: TableShape;
  categories: TableShape;
  listings: TableShape;
  listing_media: TableShape;
  conversations: TableShape;
  messages: TableShape;
  offers: TableShape;
  transactions: TableShape;
  payment_intents: TableShape;
  fulfilments: TableShape;
  reports: TableShape;
  audit_logs: TableShape;
}
