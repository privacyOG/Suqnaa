import type { Transaction } from 'kysely';
import type { Database, TransactionStatus } from '../db/types.js';

export const orderPaymentMethods = [
  'card',
  'bank_transfer',
  'wallet',
  'xmr'
] as const;

export type OrderPaymentMethod = (typeof orderPaymentMethods)[number];
export type PaymentRail =
  | 'card'
  | 'bank_transfer'
  | 'wallet'
  | 'crypto_xmr';

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

export interface OrderPaymentContextOrder {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  amount: string | number;
  currencyCode: string;
  status: TransactionStatus;
  paymentMethod: OrderPaymentMethod;
  paymentProvider: string | null;
  paymentReference: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
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

function assertMatchingIntent(
  intent: Record<string, any>,
  order: OrderPaymentContextOrder,
  rail: PaymentRail
): void {
  const matches =
    intent.transaction_id === order.id &&
    intent.buyer_id === order.buyerId &&
    intent.seller_id === order.sellerId &&
    intent.listing_id === order.listingId &&
    intent.rail === rail &&
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

export async function ensureOrderPaymentContext(
  transaction: Transaction<Database>,
  order: OrderPaymentContextOrder
): Promise<OrderPaymentContextRecord> {
  const rail = paymentRailForOrderMethod(order.paymentMethod);
  let intent = await transaction.selectFrom('payment_intents')
    .select([
      'id',
      'transaction_id',
      'buyer_id',
      'seller_id',
      'listing_id',
      'rail',
      'status',
      'amount',
      'currency_code',
      'provider',
      'provider_reference',
      'expires_at',
      'created_at',
      'updated_at'
    ])
    .where('transaction_id', '=', order.id)
    .executeTakeFirst();

  if (!intent) {
    if (order.paymentProvider || order.paymentReference) {
      throw new OrderPaymentContextError(
        'Configured order payment context requires reconciliation'
      );
    }

    const createdAt = new Date(order.createdAt);
    const updatedAt = new Date(order.updatedAt);
    intent = await transaction.insertInto('payment_intents')
      .values({
        transaction_id: order.id,
        buyer_id: order.buyerId,
        seller_id: order.sellerId,
        listing_id: order.listingId,
        auction_id: null,
        winning_bid_id: null,
        rail,
        status: paymentStatusForOrderStatus(order.status),
        amount: normalizedAmount(order.amount),
        currency_code: normalizedCurrency(order.currencyCode),
        provider: null,
        provider_reference: null,
        expires_at: null,
        created_at: createdAt,
        updated_at: updatedAt
      })
      .onConflict((conflict) => conflict.doNothing())
      .returning([
        'id',
        'transaction_id',
        'buyer_id',
        'seller_id',
        'listing_id',
        'rail',
        'status',
        'amount',
        'currency_code',
        'provider',
        'provider_reference',
        'expires_at',
        'created_at',
        'updated_at'
      ])
      .executeTakeFirst();

    if (!intent) {
      intent = await transaction.selectFrom('payment_intents')
        .select([
          'id',
          'transaction_id',
          'buyer_id',
          'seller_id',
          'listing_id',
          'rail',
          'status',
          'amount',
          'currency_code',
          'provider',
          'provider_reference',
          'expires_at',
          'created_at',
          'updated_at'
        ])
        .where('transaction_id', '=', order.id)
        .executeTakeFirst();
    }
  }

  if (!intent) {
    throw new OrderPaymentContextError(
      'Order payment context could not be created'
    );
  }
  assertMatchingIntent(intent, order, rail);

  let fulfilment = await transaction.selectFrom('fulfilments')
    .select(['id', 'payment_intent_id', 'status', 'created_at', 'updated_at'])
    .where('payment_intent_id', '=', intent.id)
    .executeTakeFirst();

  if (!fulfilment) {
    fulfilment = await transaction.insertInto('fulfilments')
      .values({
        payment_intent_id: intent.id,
        status: 'not_started',
        created_at: intent.created_at,
        updated_at: intent.updated_at
      })
      .onConflict((conflict) => conflict.doNothing())
      .returning([
        'id',
        'payment_intent_id',
        'status',
        'created_at',
        'updated_at'
      ])
      .executeTakeFirst();

    if (!fulfilment) {
      fulfilment = await transaction.selectFrom('fulfilments')
        .select([
          'id',
          'payment_intent_id',
          'status',
          'created_at',
          'updated_at'
        ])
        .where('payment_intent_id', '=', intent.id)
        .executeTakeFirst();
    }
  }

  if (!fulfilment || fulfilment.payment_intent_id !== intent.id) {
    throw new OrderPaymentContextError(
      'Order fulfilment context could not be created'
    );
  }

  return presentOrderPaymentContext(intent, fulfilment);
}
