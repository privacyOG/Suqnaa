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
export type ProtectionBeneficiaryRole = 'buyer' | 'seller';
export type ProtectionClaimType =
  | 'non_delivery'
  | 'item_not_as_described'
  | 'post_payment_cancellation'
  | 'return_request'
  | 'return_not_received'
  | 'returned_item_condition';
export type ReturnStatus =
  | 'authorized'
  | 'awaiting_shipment'
  | 'in_transit'
  | 'delivered'
  | 'received'
  | 'contested'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type ModerationPolicyAction = 'block' | 'manual_review';
export type ModerationActionType =
  | 'listing_review_pending'
  | 'listing_approve'
  | 'listing_takedown'
  | 'account_suspend'
  | 'account_close'
  | 'no_action';
export type ModerationActionStatus = 'active' | 'reversed' | 'superseded';
export type ModerationAppealStatus = 'open' | 'upheld' | 'overturned' | 'dismissed';
export type RiskCategory =
  | 'account_abuse'
  | 'offer_payment_fraud'
  | 'account_takeover'
  | 'velocity_anomaly'
  | 'duplicate_identity'
  | 'suspicious_seller';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskSignalStatus = 'open' | 'reviewed' | 'dismissed' | 'escalated';
export type RiskReviewDisposition = 'confirmed' | 'false_positive' | 'monitor' | 'escalated';

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
  listing_media_derivatives: TableShape;
  listing_media_quarantine: TableShape;
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
  order_protection_cases: TableShape;
  order_returns: TableShape;
  protection_events: TableShape;
  reports: TableShape;
  moderation_policy_rules: TableShape;
  moderation_actions: TableShape;
  moderation_notes: TableShape;
  moderation_appeals: TableShape;
  risk_rules: TableShape;
  risk_event_observations: TableShape;
  risk_signals: TableShape;
  risk_identity_links: TableShape;
  audit_logs: TableShape;
}
