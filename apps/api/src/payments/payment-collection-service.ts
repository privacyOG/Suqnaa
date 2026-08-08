import { db } from '../db/index.js';
import type { PaymentStatus, TransactionStatus } from '../db/types.js';
import {
  assertOrderPaymentContextMatches,
  orderPaymentMethods,
  OrderPaymentContextError
} from './order-payment-context.js';
import {
  StripeCheckoutProvider,
  stripeMinorUnits,
  type StripeChargeReceipt
} from './stripe-checkout-provider.js';
import {
  stripePaymentFingerprint,
  type StripePaymentSucceededEvent
} from './stripe-webhook.js';

export class PaymentCollectionError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
  }
}

export async function beginStripeCheckout(input: {
  provider: StripeCheckoutProvider;
  internalPaymentIntentId: string;
  orderId: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  buyerEmail: string;
  amount: string | number;
  currencyCode: string;
  paymentMethod: 'card' | 'wallet';
  locale: 'en' | 'ar';
}) {
  const session = await input.provider.createCheckoutSession({
    internalPaymentIntentId: input.internalPaymentIntentId,
    orderId: input.orderId,
    listingId: input.listingId,
    sellerId: input.sellerId,
    amount: input.amount,
    currencyCode: input.currencyCode,
    buyerEmail: input.buyerEmail,
    locale: input.locale
  });

  await db.transaction().execute(async (transaction) => {
    const intent = await transaction.selectFrom('payment_intents')
      .select([
        'id', 'transaction_id', 'buyer_id', 'seller_id', 'listing_id',
        'rail', 'status', 'amount', 'currency_code'
      ])
      .where('id', '=', input.internalPaymentIntentId)
      .forUpdate()
      .executeTakeFirst();
    if (!intent || intent.transaction_id !== input.orderId) {
      throw new PaymentCollectionError('payment_context_missing');
    }
    try {
      assertOrderPaymentContextMatches(intent, {
        id: input.orderId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        listingId: input.listingId,
        amount: input.amount,
        currencyCode: input.currencyCode,
        status: 'pending',
        paymentMethod: input.paymentMethod
      });
    } catch (error) {
      if (error instanceof OrderPaymentContextError) {
        throw new PaymentCollectionError('payment_context_inconsistent');
      }
      throw error;
    }
    if (intent.status !== 'created' && intent.status !== 'awaiting_payment') {
      throw new PaymentCollectionError('payment_state_invalid');
    }

    await transaction.insertInto('payment_collection_sessions')
      .values({
        payment_intent_id: intent.id,
        provider: 'stripe',
        provider_session_id: session.id,
        provider_payment_reference: null,
        status: 'open',
        expires_at: session.expiresAt,
        updated_at: new Date()
      })
      .onConflict((conflict) => conflict.column('payment_intent_id').doUpdateSet({
        provider: 'stripe',
        provider_session_id: session.id,
        status: 'open',
        expires_at: session.expiresAt,
        updated_at: new Date()
      }))
      .execute();

    await transaction.updateTable('payment_intents')
      .set({
        status: 'awaiting_payment',
        expires_at: session.expiresAt,
        updated_at: new Date()
      })
      .where('id', '=', intent.id)
      .where('status', 'in', ['created', 'awaiting_payment'])
      .executeTakeFirstOrThrow();
  });

  return session;
}

function ensureProviderEventMatch(
  existing: Record<string, any>,
  event: StripePaymentSucceededEvent,
  fingerprint: string
): void {
  const payment = event.data.object;
  if (
    existing.provider !== 'stripe' ||
    existing.provider_event_id !== event.id ||
    existing.payment_intent_id !== payment.metadata.suqnaa_payment_intent_id ||
    existing.event_type !== 'payment.held' ||
    existing.provider_reference !== payment.id ||
    existing.payload_fingerprint !== fingerprint
  ) {
    throw new PaymentCollectionError('provider_event_replay_conflict');
  }
}

export async function applyStripePaymentSucceeded(input: {
  event: StripePaymentSucceededEvent;
  receipt: StripeChargeReceipt;
}): Promise<{ orderId: string; duplicate: boolean; unchanged: boolean }> {
  const event = input.event;
  const payment = event.data.object;
  const internalPaymentIntentId = payment.metadata.suqnaa_payment_intent_id;
  const fingerprint = stripePaymentFingerprint(event);

  return db.transaction().execute(async (transaction) => {
    const existingEvent = await transaction.selectFrom('payment_provider_events')
      .select([
        'provider', 'provider_event_id', 'payment_intent_id', 'event_type',
        'provider_reference', 'payload_fingerprint'
      ])
      .where('provider', '=', 'stripe')
      .where('provider_event_id', '=', event.id)
      .executeTakeFirst();
    if (existingEvent) {
      ensureProviderEventMatch(existingEvent, event, fingerprint);
      const existingIntent = await transaction.selectFrom('payment_intents')
        .select(['transaction_id'])
        .where('id', '=', internalPaymentIntentId)
        .executeTakeFirst();
      if (!existingIntent?.transaction_id) {
        throw new PaymentCollectionError('payment_context_missing');
      }
      return {
        orderId: String(existingIntent.transaction_id),
        duplicate: true,
        unchanged: true
      };
    }

    const intent = await transaction.selectFrom('payment_intents')
      .select([
        'id', 'transaction_id', 'buyer_id', 'seller_id', 'listing_id', 'rail',
        'status', 'amount', 'currency_code', 'provider', 'provider_reference'
      ])
      .where('id', '=', internalPaymentIntentId)
      .forUpdate()
      .executeTakeFirst();
    if (!intent?.transaction_id) {
      throw new PaymentCollectionError('payment_context_missing');
    }

    const order = await transaction.selectFrom('transactions')
      .select([
        'id', 'buyer_id', 'seller_id', 'listing_id', 'amount', 'currency_code',
        'status', 'payment_method', 'payment_provider', 'payment_reference'
      ])
      .where('id', '=', intent.transaction_id)
      .forUpdate()
      .executeTakeFirst();
    if (!order) {
      throw new PaymentCollectionError('order_context_missing');
    }

    const session = await transaction.selectFrom('payment_collection_sessions')
      .select(['provider', 'provider_session_id', 'provider_payment_reference', 'status'])
      .where('payment_intent_id', '=', intent.id)
      .executeTakeFirst();
    if (!session || session.provider !== 'stripe') {
      throw new PaymentCollectionError('collection_session_missing');
    }

    const parsedMethod = orderPaymentMethods.find((value) => value === order.payment_method);
    if (parsedMethod !== 'card' && parsedMethod !== 'wallet') {
      throw new PaymentCollectionError('payment_method_invalid');
    }
    try {
      assertOrderPaymentContextMatches(intent, {
        id: String(order.id),
        buyerId: String(order.buyer_id),
        sellerId: String(order.seller_id),
        listingId: String(order.listing_id),
        amount: order.amount as string | number,
        currencyCode: String(order.currency_code),
        status: order.status as TransactionStatus,
        paymentMethod: parsedMethod
      });
    } catch (error) {
      if (error instanceof OrderPaymentContextError) {
        throw new PaymentCollectionError('payment_context_inconsistent');
      }
      throw error;
    }

    if (
      payment.metadata.suqnaa_order_id !== order.id ||
      payment.metadata.suqnaa_listing_id !== order.listing_id ||
      payment.metadata.suqnaa_seller_id !== order.seller_id ||
      payment.currency.toUpperCase() !== String(order.currency_code).toUpperCase() ||
      payment.currency.toUpperCase() !== 'AUD' ||
      payment.amount !== stripeMinorUnits(order.amount as string | number) ||
      payment.amount_received !== payment.amount ||
      payment.transfer_group !== `suqnaa_order_${order.id}` ||
      input.receipt.chargeId !== payment.latest_charge
    ) {
      throw new PaymentCollectionError('provider_payment_context_mismatch');
    }

    const orderAlreadyPaid = order.status === 'paid';
    const intentAlreadyHeld = (intent.status as PaymentStatus) === 'held';
    let unchanged = orderAlreadyPaid && intentAlreadyHeld;
    if (unchanged) {
      if (
        order.payment_provider !== 'stripe' ||
        order.payment_reference !== payment.id ||
        intent.provider !== 'stripe' ||
        intent.provider_reference !== payment.id
      ) {
        throw new PaymentCollectionError('provider_reference_conflict');
      }
    } else {
      if (
        order.status !== 'pending' ||
        !['created', 'awaiting_payment'].includes(String(intent.status)) ||
        (order.payment_provider !== null && order.payment_provider !== 'stripe') ||
        (order.payment_reference !== null && order.payment_reference !== payment.id) ||
        (intent.provider !== null && intent.provider !== 'stripe') ||
        (intent.provider_reference !== null && intent.provider_reference !== payment.id)
      ) {
        throw new PaymentCollectionError('payment_transition_invalid');
      }

      const updated = await transaction.updateTable('transactions')
        .set({
          status: 'paid',
          payment_provider: 'stripe',
          payment_reference: payment.id,
          updated_at: new Date()
        })
        .where('id', '=', order.id)
        .where('status', '=', 'pending')
        .returning(['id'])
        .executeTakeFirst();
      if (!updated) {
        throw new PaymentCollectionError('payment_transition_conflict');
      }
      unchanged = false;
    }

    await transaction.updateTable('payment_collection_sessions')
      .set({
        status: 'completed',
        provider_payment_reference: payment.id,
        updated_at: new Date()
      })
      .where('payment_intent_id', '=', intent.id)
      .execute();

    await transaction.insertInto('payment_receipts')
      .values({
        payment_intent_id: intent.id,
        provider: 'stripe',
        provider_payment_reference: payment.id,
        provider_charge_reference: input.receipt.chargeId,
        receipt_url: input.receipt.receiptUrl,
        receipt_number: input.receipt.receiptNumber,
        issued_at: new Date(event.created * 1000)
      })
      .onConflict((conflict) => conflict.column('payment_intent_id').doUpdateSet({
        provider: 'stripe',
        provider_payment_reference: payment.id,
        provider_charge_reference: input.receipt.chargeId,
        receipt_url: input.receipt.receiptUrl,
        receipt_number: input.receipt.receiptNumber,
        issued_at: new Date(event.created * 1000)
      }))
      .execute();

    await transaction.insertInto('payment_provider_events')
      .values({
        provider: 'stripe',
        provider_event_id: event.id,
        payment_intent_id: intent.id,
        event_type: 'payment.held',
        provider_reference: payment.id,
        payload_fingerprint: fingerprint,
        occurred_at: new Date(event.created * 1000),
        processed_at: new Date(),
        processing_result: unchanged ? 'unchanged' : 'processed'
      })
      .execute();

    return { orderId: String(order.id), duplicate: false, unchanged };
  });
}
