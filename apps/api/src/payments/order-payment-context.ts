import type {
  FulfilmentStatus,
  PaymentRail,
  PaymentStatus,
  TransactionStatus
} from '../db/types.js';

export const orderPaymentMethods = [
  'card',
  'bank_transfer',
  'wallet',
  'xmr'
] as const;

export type OrderPaymentMethod = (typeof orderPaymentMethods)[number];

export interface OrderPaymentContextOrder {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  amount: string | number;
  currencyCode: string;
  status: TransactionStatus;
  paymentMethod: OrderPaymentMethod;
}

export interface OrderPaymentContextRecord {
  paymentIntent: {
    id: string;
    rail: PaymentRail;
    status: PaymentStatus;
    providerConfigured: boolean;
    expiresAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  fulfilment: {
    id: string;
    status: FulfilmentStatus;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  releaseModel: 'hold_until_fulfilment_or_dispute_resolution';
  operations: {
    collectionEnabled: false;
    releaseEnabled: false;
  };
}

export class OrderPaymentContextError extends Error {}

export function paymentRailForOrderMethod(
  method: OrderPaymentMethod
): PaymentRail {
  switch (method) {
    case 'card':
      return 'card';
    case 'bank_transfer':
      return 'bank_transfer';
    case 'wallet':
      return 'wallet';
    case 'xmr':
      return 'crypto_xmr';
  }
}

export function paymentStatusForOrderStatus(
  status: TransactionStatus
): PaymentStatus {
  switch (status) {
    case 'pending':
      return 'created';
    case 'paid':
      return 'held';
    case 'released':
      return 'released';
    case 'refunded':
      return 'refunded';
    case 'disputed':
      return 'disputed';
    case 'cancelled':
      return 'cancelled';
  }
}

function normalizedAmount(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new OrderPaymentContextError('Order payment amount is invalid');
  }
  return amount.toFixed(2);
}

function normalizedCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new OrderPaymentContextError('Order payment currency is invalid');
  }
  return currency;
}

export function assertOrderPaymentContextMatches(
  intent: Record<string, any>,
  order: OrderPaymentContextOrder
): void {
  const matches =
    intent.transaction_id === order.id &&
    intent.buyer_id === order.buyerId &&
    intent.seller_id === order.sellerId &&
    intent.listing_id === order.listingId &&
    intent.rail === paymentRailForOrderMethod(order.paymentMethod) &&
    normalizedAmount(intent.amount as string | number) ===
      normalizedAmount(order.amount) &&
    String(intent.currency_code).toUpperCase() ===
      normalizedCurrency(order.currencyCode);

  if (!matches) {
    throw new OrderPaymentContextError(
      'Order payment context does not match the stored order'
    );
  }
}

export function presentOrderPaymentContext(
  intent: Record<string, any>,
  fulfilment: Record<string, any>
): OrderPaymentContextRecord {
  return {
    paymentIntent: {
      id: String(intent.id),
      rail: intent.rail as PaymentRail,
      status: intent.status as PaymentStatus,
      providerConfigured: Boolean(
        intent.provider || intent.provider_reference
      ),
      expiresAt: intent.expires_at ?? null,
      createdAt: intent.created_at,
      updatedAt: intent.updated_at
    },
    fulfilment: {
      id: String(fulfilment.id),
      status: fulfilment.status as FulfilmentStatus,
      createdAt: fulfilment.created_at,
      updatedAt: fulfilment.updated_at
    },
    releaseModel: 'hold_until_fulfilment_or_dispute_resolution',
    operations: {
      collectionEnabled: false,
      releaseEnabled: false
    }
  };
}
