import { getAuthed, postAuthed } from './authed-api';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ShippingOption {
  id: string;
  label: string;
  carrier: string | null;
  serviceCode: string | null;
  amount: string | number;
  currencyCode: string;
  etaMinDays: number | null;
  etaMaxDays: number | null;
}

export interface OrderAddress {
  line1: string;
  line2: string | null;
  locality: string;
  region: string;
  postalCode: string;
  countryCode: string;
}

export interface OrderDeliveryContext {
  orderId: string;
  role: 'buyer' | 'seller';
  pricing: {
    itemAmount: string | number;
    shippingAmount: string | number;
    totalAmount: string | number;
    currencyCode: string;
  };
  delivery: null | {
    mode: 'shipping' | 'pickup';
    shippingOptionId: string | null;
    shippingMethodLabel: string | null;
    shippingCarrier: string | null;
    shippingServiceCode: string | null;
    shippingAmount: string | number;
    recipientName: string | null;
    shippingAddress: OrderAddress | null;
    pickupAddress: OrderAddress | null;
    pickupInstructions: string | null;
    updatedAt: string;
  };
  fulfilment: null | {
    status: 'not_started' | 'ready_for_pickup' | 'shipped' | 'delivered' | 'received_confirmed' | 'failed';
    carrier: string | null;
    trackingReference: string | null;
    trackingUrl: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    buyerConfirmedAt: string | null;
  };
  pickupProof: null | {
    active: boolean;
    expiresAt: string;
    verifiedAt: string | null;
  };
  evidence: Array<{
    id: string;
    actorId: string;
    type: string;
    reference: string | null;
    url: string | null;
    note: string | null;
    occurredAt: string;
  }>;
}

export interface OrderTimelineResponse {
  orderId: string;
  events: Array<{
    id: string;
    actorId: string | null;
    type: string;
    details: Record<string, unknown>;
    occurredAt: string;
  }>;
}

function orderId(value: string): string {
  const normalized = value.trim();
  if (!uuidPattern.test(normalized)) throw new Error('Order identifier must be a UUID');
  return normalized;
}

function listingId(value: string): string {
  const normalized = value.trim();
  if (!uuidPattern.test(normalized)) throw new Error('Listing identifier must be a UUID');
  return normalized;
}

export function getListingShippingOptions(value: string): Promise<{ listingId: string; options: ShippingOption[] }> {
  return getAuthed(`/v1/listings/${listingId(value)}/shipping-options`);
}

export function replaceListingShippingOptions(value: string, options: Array<{
  label: string;
  carrier?: string;
  serviceCode?: string;
  amount: number;
  etaMinDays?: number;
  etaMaxDays?: number;
}>): Promise<{ listingId: string; options: ShippingOption[] }> {
  return postAuthed(`/v1/market/listings/${listingId(value)}/shipping-options`, { options });
}

export function getOrderDelivery(value: string): Promise<OrderDeliveryContext> {
  return getAuthed(`/v1/market/orders/${orderId(value)}/delivery`);
}

export function configureOrderDelivery(value: string, input:
  | { mode: 'pickup' }
  | {
      mode: 'shipping';
      shippingOptionId: string;
      recipientName: string;
      address: { line1: string; line2?: string; locality: string; region: string; postalCode: string; countryCode: 'AU' };
    }
): Promise<{ accepted: true; orderId: string; unchanged: boolean; totalAmount: string | number; shippingAmount: string | number; mode: string }> {
  return postAuthed(`/v1/market/orders/${orderId(value)}/delivery`, input);
}

export function setPickupDetails(value: string, input: {
  address: { line1: string; line2?: string; locality: string; region: string; postalCode: string; countryCode: 'AU' };
  instructions?: string;
}) {
  return postAuthed<{ accepted: true; orderId: string }>(`/v1/market/orders/${orderId(value)}/pickup-details`, input);
}

export function issuePickupProof(value: string) {
  return postAuthed<{ accepted: true; orderId: string; pickupProof: { code: string; expiresAt: string } }>(
    `/v1/market/orders/${orderId(value)}/pickup-proof`,
    {}
  );
}

export function verifyPickupProof(value: string, code: string) {
  return postAuthed<{ accepted: true; orderId: string; unchanged: boolean; status: string }>(
    `/v1/market/orders/${orderId(value)}/pickup-proof/verify`,
    { code: code.trim() }
  );
}

export function submitDeliveryEvidence(value: string, input: { note: string; evidenceUrl?: string }) {
  return postAuthed<{ accepted: true; orderId: string; unchanged: boolean; status: string }>(
    `/v1/market/orders/${orderId(value)}/delivery-evidence`,
    input
  );
}

export function getOrderTimeline(value: string): Promise<OrderTimelineResponse> {
  return getAuthed(`/v1/market/orders/${orderId(value)}/timeline`);
}
