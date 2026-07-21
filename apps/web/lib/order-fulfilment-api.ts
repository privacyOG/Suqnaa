import { getAuthed, postAuthed } from './authed-api';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FulfilmentStatus =
  | 'not_started'
  | 'ready_for_pickup'
  | 'shipped'
  | 'delivered'
  | 'received_confirmed'
  | 'failed';

export type PaymentContextStatus =
  | 'created'
  | 'awaiting_payment'
  | 'funds_received'
  | 'held'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'cancelled'
  | 'compliance_hold';

export interface OrderPaymentContextResponse {
  orderId: string;
  paymentContext: {
    paymentIntent: {
      id: string;
      rail: 'card' | 'bank_transfer' | 'wallet' | 'crypto_xmr' | 'crypto_other';
      status: PaymentContextStatus;
      providerConfigured: boolean;
      expiresAt: string | null;
      createdAt: string;
      updatedAt: string;
    };
    fulfilment: {
      id: string;
      status: FulfilmentStatus;
      createdAt: string;
      updatedAt: string;
    };
    releaseModel: 'hold_until_fulfilment_or_dispute_resolution';
    operations: {
      collectionEnabled: false;
      releaseEnabled: false;
    };
  };
}

export type FulfilmentMutationInput =
  | { action: 'ready_for_pickup' }
  | { action: 'shipped'; carrier: string; trackingReference: string }
  | { action: 'confirm_received' };

export interface FulfilmentMutationResponse {
  accepted: true;
  orderId: string;
  fulfilment: {
    id: string;
    status: FulfilmentStatus;
    carrier: string | null;
    trackingReference: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    buyerConfirmedAt: string | null;
    updatedAt: string;
    unchanged: boolean;
  };
  payment: {
    releaseEnabled: false;
  };
}

function normalizedOrderId(orderId: string): string {
  const value = orderId.trim();
  if (!uuidPattern.test(value)) {
    throw new Error('Order identifier must be a UUID');
  }
  return value;
}

function normalizedInput(input: FulfilmentMutationInput): FulfilmentMutationInput {
  if (input.action !== 'shipped') {
    return input;
  }

  const carrier = input.carrier.trim();
  const trackingReference = input.trackingReference.trim();
  if (carrier.length < 2 || carrier.length > 80) {
    throw new Error('Carrier must be between 2 and 80 characters');
  }
  if (trackingReference.length < 3 || trackingReference.length > 160) {
    throw new Error('Tracking reference must be between 3 and 160 characters');
  }

  return { action: 'shipped', carrier, trackingReference };
}

export function getOrderPaymentContext(
  orderId: string
): Promise<OrderPaymentContextResponse> {
  const id = normalizedOrderId(orderId);
  return getAuthed<OrderPaymentContextResponse>(
    `/v1/market/orders/${id}/payment-context`
  );
}

export function updateOrderFulfilment(
  orderId: string,
  input: FulfilmentMutationInput,
  challengeResponse?: string
): Promise<FulfilmentMutationResponse> {
  const id = normalizedOrderId(orderId);
  return postAuthed<FulfilmentMutationResponse>(
    `/v1/market/orders/${id}/fulfilment`,
    normalizedInput(input),
    challengeResponse
  );
}
