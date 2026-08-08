import { getAuthed, postAuthed } from './authed-api';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ProtectionCaseRow {
  id: string;
  dispute_id: string;
  order_id: string;
  claimant_user_id: string;
  respondent_user_id: string;
  beneficiary_role: 'buyer' | 'seller';
  claim_type: string;
  policy_version: string;
  eligibility_basis: unknown;
  created_at: string;
  updated_at: string;
}

export interface OrderReturnRow {
  id: string;
  protection_case_id: string;
  dispute_id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  status: 'authorized' | 'awaiting_shipment' | 'in_transit' | 'delivered' | 'received' | 'contested' | 'resolved' | 'expired' | 'cancelled';
  reason: string;
  carrier: string | null;
  tracking_reference: string | null;
  tracking_url: string | null;
  return_due_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  received_at: string | null;
  seller_condition: 'accepted' | 'contested' | null;
  seller_condition_note: string | null;
  resolved_at: string | null;
}

export interface OrderProtectionSnapshot {
  cases: ProtectionCaseRow[];
  returns: OrderReturnRow[];
}

function id(value: string, label: string): string {
  const normalized = value.trim();
  if (!uuidPattern.test(normalized)) throw new Error(`${label} must be a UUID`);
  return normalized;
}

export function readOrderProtection(orderId: string): Promise<OrderProtectionSnapshot> {
  return getAuthed(`/v1/market/orders/${id(orderId, 'Order identifier')}/protection`);
}

export function shipProtectedReturn(returnId: string, input: {
  carrier: string;
  trackingReference: string;
  trackingUrl?: string;
}) {
  const carrier = input.carrier.trim();
  const trackingReference = input.trackingReference.trim();
  if (carrier.length < 2 || carrier.length > 80) throw new Error('Carrier must be 2-80 characters');
  if (trackingReference.length < 2 || trackingReference.length > 200) throw new Error('Tracking reference must be 2-200 characters');
  const trackingUrl = input.trackingUrl?.trim();
  if (trackingUrl) {
    const parsed = new URL(trackingUrl);
    if (parsed.protocol !== 'https:') throw new Error('Tracking URL must use HTTPS');
  }
  return postAuthed(`/v1/market/returns/${id(returnId, 'Return identifier')}/ship`, {
    carrier,
    trackingReference,
    ...(trackingUrl ? { trackingUrl } : {})
  });
}

export function acknowledgeProtectedReturn(returnId: string, input: {
  condition: 'accepted' | 'contested';
  note?: string;
}) {
  const note = input.note?.trim();
  if (input.condition === 'contested' && (!note || note.length < 8)) {
    throw new Error('A contest note of at least 8 characters is required');
  }
  return postAuthed(`/v1/market/returns/${id(returnId, 'Return identifier')}/receipt`, {
    condition: input.condition,
    ...(note ? { note } : {})
  });
}
