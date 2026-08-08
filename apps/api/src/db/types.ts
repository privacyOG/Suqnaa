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
export type FulfilmentMode = 'shipping' | 'pickup';
export type DisputeStatus =
  | 'opened'
  | 'awaiting_buyer'
  | 'awaiting_seller'
  | 'under_review'
  | 'resolved'
  | 'closed';
export type DisputeOutcome =
  | 'none'
  | 'buyer_refund'
  | 'seller_release'
  | 'partial_refund'
  | 'return_required'
  | 'compliance_escalation';
export type DisputeCategory =
  | 'non_delivery'
  | 'item_condition'
  | 'damage'
  | 'pickup_issue'
  | 'payment_issue'
  | 'other';

type TableShape = Record<string, any>;

export interface Database {
  users: TableShape;
  user_profiles: TableShape;
  refresh_sessions: TableShape;
  account_contact_verifications: TableShape;
  password_reset_tokens: TableShape;
  verification_checks: TableShape;
  verification_provider_events: TableShape;
  admin_permissions: TableShape;
  admin_roles: TableShape;
  admin_role_permissions: TableShape;
  admin_role_assignments: TableShape;
  categories: TableShape;
  listings: TableShape;
  listing_media: TableShape;
  listing_inventory_reservations: TableShape;
  listing_shipping_options: TableShape;
  saved_listings: TableShape;
  listing_watchlist: TableShape;
  recently_viewed_listings: TableShape;
  saved_searches: TableShape;
  saved_search_notifications: TableShape;
  notifications: TableShape;
  notification_preferences: TableShape;
  notification_push_targets: TableShape;
  notification_deliveries: TableShape;
  conversations: TableShape;
  conversation_mutes: TableShape;
  user_blocks: TableShape;
  messages: TableShape;
  offers: TableShape;
  transactions: TableShape;
  payment_intents: TableShape;
  payment_provider_events: TableShape;
  payment_collection_sessions: TableShape;
  payment_receipts: TableShape;
  payment_operations: TableShape;
  seller_payout_accounts: TableShape;
  seller_settlements: TableShape;
  settlement_reversals: TableShape;
  settlement_ledger_entries: TableShape;
  seller_payout_events: TableShape;
  fulfilments: TableShape;
  order_fulfilment_details: TableShape;
  pickup_proofs: TableShape;
  order_fulfilment_evidence: TableShape;
  order_timeline_events: TableShape;
  disputes: TableShape;
  dispute_evidence: TableShape;
  dispute_responses: TableShape;
  dispute_appeals: TableShape;
  dispute_events: TableShape;
  reports: TableShape;
  audit_logs: TableShape;
}
