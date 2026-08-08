import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';
import {
  applyStripePaymentSucceeded,
  beginStripeCheckout
} from './payment-collection-service.js';
import { StripeCheckoutProvider } from './stripe-checkout-provider.js';
import type { StripePaymentSucceededEvent } from './stripe-webhook.js';

const buyerId = randomUUID();
const sellerId = randomUUID();
const listingId = randomUUID();
const orderId = randomUUID();
const now = new Date('2026-08-08T10:00:00.000Z');
let paymentIntentId: string | null = null;

const configuration: PaymentCollectionConfiguration = {
  enabled: true,
  provider: 'stripe',
  liveMode: false,
  secretKey: 'sk_test_1234567890abcdef',
  webhookSecret: 'whsec_1234567890abcdef',
  apiBaseUrl: 'https://api.stripe.com',
  apiVersion: '2026-02-25.clover',
  timeoutMs: 5000,
  webOrigin: 'https://suqnaa.example'
};

try {
  await db.insertInto('users').values([
    {
      id: buyerId,
      email: `payment-buyer-${buyerId}@example.test`,
      display_name: 'Payment Buyer',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: sellerId,
      email: `payment-seller-${sellerId}@example.test`,
      display_name: 'Payment Seller',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: sellerId,
    title: 'Payment collection test listing',
    description: 'Durable payment collection integration test listing.',
    price_amount: '199.95',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'reserved',
    country_code: 'AU',
    allow_pickup: true,
    allow_delivery: false,
    published_at: now,
    created_at: now,
    updated_at: now
  }).execute();

  await db.insertInto('transactions').values({
    id: orderId,
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount: '199.95',
    currency_code: 'AUD',
    status: 'pending',
    payment_method: 'card',
    client_order_id: randomUUID(),
    created_at: now,
    updated_at: now
  }).execute();

  const intent = await db.selectFrom('payment_intents')
    .select(['id', 'status'])
    .where('transaction_id', '=', orderId)
    .executeTakeFirstOrThrow();
  paymentIntentId = String(intent.id);
  assert.equal(intent.status, 'created');

  const provider = new StripeCheckoutProvider(configuration, (async () => new Response(JSON.stringify({
    id: 'cs_test_1234567890abcdef',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1234567890abcdef',
    expires_at: Math.floor((now.getTime() + 30 * 60 * 1000) / 1000)
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch);

  await beginStripeCheckout({
    provider,
    internalPaymentIntentId: String(intent.id),
    orderId,
    listingId,
    sellerId,
    buyerId,
    buyerEmail: `payment-buyer-${buyerId}@example.test`,
    amount: '199.95',
    currencyCode: 'AUD',
    paymentMethod: 'card',
    locale: 'en'
  });

  assert.equal(
    (await db.selectFrom('payment_intents').select('status').where('id', '=', intent.id).executeTakeFirstOrThrow()).status,
    'awaiting_payment'
  );
  assert.equal(
    (await db.selectFrom('payment_collection_sessions').select('status').where('payment_intent_id', '=', intent.id).executeTakeFirstOrThrow()).status,
    'open'
  );

  const event: StripePaymentSucceededEvent = {
    id: 'evt_1234567890abcdef',
    object: 'event',
    type: 'payment_intent.succeeded',
    created: Math.floor((now.getTime() + 60_000) / 1000),
    livemode: false,
    data: {
      object: {
        id: 'pi_1234567890abcdef',
        object: 'payment_intent',
        amount: 19995,
        amount_received: 19995,
        currency: 'aud',
        status: 'succeeded',
        latest_charge: 'ch_1234567890abcdef',
        transfer_group: `suqnaa_order_${orderId}`,
        receipt_email: `payment-buyer-${buyerId}@example.test`,
        metadata: {
          suqnaa_order_id: orderId,
          suqnaa_payment_intent_id: String(intent.id),
          suqnaa_listing_id: listingId,
          suqnaa_seller_id: sellerId
        }
      }
    }
  };

  const applied = await applyStripePaymentSucceeded({
    event,
    receipt: {
      chargeId: 'ch_1234567890abcdef',
      receiptUrl: 'https://pay.stripe.com/receipts/payment/test',
      receiptNumber: '1000-2000'
    }
  });
  assert.equal(applied.duplicate, false);
  assert.equal(applied.unchanged, false);

  const paidOrder = await db.selectFrom('transactions')
    .select(['status', 'payment_provider', 'payment_reference'])
    .where('id', '=', orderId)
    .executeTakeFirstOrThrow();
  assert.equal(paidOrder.status, 'paid');
  assert.equal(paidOrder.payment_provider, 'stripe');
  assert.equal(paidOrder.payment_reference, 'pi_1234567890abcdef');

  const heldIntent = await db.selectFrom('payment_intents')
    .select(['status', 'provider', 'provider_reference'])
    .where('id', '=', intent.id)
    .executeTakeFirstOrThrow();
  assert.equal(heldIntent.status, 'held');
  assert.equal(heldIntent.provider, 'stripe');
  assert.equal(heldIntent.provider_reference, 'pi_1234567890abcdef');

  const receipt = await db.selectFrom('payment_receipts')
    .select(['provider_charge_reference', 'receipt_url'])
    .where('payment_intent_id', '=', intent.id)
    .executeTakeFirstOrThrow();
  assert.equal(receipt.provider_charge_reference, 'ch_1234567890abcdef');
  assert.equal(receipt.receipt_url, 'https://pay.stripe.com/receipts/payment/test');

  const replay = await applyStripePaymentSucceeded({
    event,
    receipt: {
      chargeId: 'ch_1234567890abcdef',
      receiptUrl: 'https://pay.stripe.com/receipts/payment/test',
      receiptNumber: '1000-2000'
    }
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.unchanged, true);
} finally {
  if (paymentIntentId) {
    await db.deleteFrom('payment_provider_events').where('payment_intent_id', '=', paymentIntentId).execute();
    await db.deleteFrom('payment_receipts').where('payment_intent_id', '=', paymentIntentId).execute();
    await db.deleteFrom('payment_collection_sessions').where('payment_intent_id', '=', paymentIntentId).execute();
    await db.deleteFrom('fulfilments').where('payment_intent_id', '=', paymentIntentId).execute();
    await db.deleteFrom('payment_intents').where('id', '=', paymentIntentId).execute();
  }
  await db.deleteFrom('transactions').where('id', '=', orderId).execute();
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  await db.deleteFrom('users').where('id', 'in', [buyerId, sellerId]).execute();
  await closeDb();
}
