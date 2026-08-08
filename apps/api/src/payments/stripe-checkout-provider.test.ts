import assert from 'node:assert/strict';
import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';
import {
  StripeCheckoutProvider,
  stripeCheckoutIdempotencyKey
} from './stripe-checkout-provider.js';

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

let capturedUrl = '';
let capturedInit: RequestInit | undefined;
const provider = new StripeCheckoutProvider(configuration, (async (input, init) => {
  capturedUrl = String(input);
  capturedInit = init;
  return new Response(JSON.stringify({
    id: 'cs_test_1234567890abcdef',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1234567890abcdef',
    expires_at: 1786200000
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch);

const internalPaymentIntentId = '123e4567-e89b-42d3-a456-426614174000';
const orderId = '223e4567-e89b-42d3-a456-426614174000';
const session = await provider.createCheckoutSession({
  internalPaymentIntentId,
  orderId,
  listingId: '323e4567-e89b-42d3-a456-426614174000',
  sellerId: '423e4567-e89b-42d3-a456-426614174000',
  amount: '199.95',
  currencyCode: 'AUD',
  buyerEmail: 'buyer@example.test',
  locale: 'en'
});

assert.equal(capturedUrl, 'https://api.stripe.com/v1/checkout/sessions');
assert.equal(capturedInit?.method, 'POST');
const headers = new Headers(capturedInit?.headers);
assert.equal(headers.get('authorization'), `Bearer ${configuration.secretKey}`);
assert.equal(headers.get('stripe-version'), '2026-02-25.clover');
assert.equal(headers.get('idempotency-key'), stripeCheckoutIdempotencyKey(internalPaymentIntentId));
const body = new URLSearchParams(String(capturedInit?.body));
assert.equal(body.get('line_items[0][price_data][unit_amount]'), '19995');
assert.equal(body.get('line_items[0][price_data][currency]'), 'aud');
assert.equal(body.get('payment_method_types[0]'), 'card');
assert.equal(body.get('payment_intent_data[transfer_group]'), `suqnaa_order_${orderId}`);
assert.equal(body.get('payment_intent_data[receipt_email]'), 'buyer@example.test');
assert.equal(body.get('payment_intent_data[metadata][suqnaa_payment_intent_id]'), internalPaymentIntentId);
assert.equal(body.get('success_url'), `https://suqnaa.example/en/activity/orders/${orderId}?payment=success&session_id={CHECKOUT_SESSION_ID}`);
assert.equal(session.id, 'cs_test_1234567890abcdef');
assert.equal(session.url.startsWith('https://checkout.stripe.com/'), true);

const receiptProvider = new StripeCheckoutProvider(configuration, (async () => new Response(JSON.stringify({
  id: 'ch_1234567890abcdef',
  receipt_url: 'https://pay.stripe.com/receipts/payment/abc',
  receipt_number: '1234-5678'
}), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch);
const receipt = await receiptProvider.retrieveChargeReceipt('ch_1234567890abcdef');
assert.equal(receipt.receiptUrl, 'https://pay.stripe.com/receipts/payment/abc');
assert.equal(receipt.receiptNumber, '1234-5678');
