import assert from 'node:assert/strict';
import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';
import { StripePaymentOperationsProvider } from './stripe-payment-operations.js';

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

let capturedBody = '';
let capturedIdempotencyKey = '';
const provider = new StripePaymentOperationsProvider(configuration, (async (_url, init) => {
  capturedBody = String(init?.body ?? '');
  capturedIdempotencyKey = new Headers(init?.headers).get('idempotency-key') ?? '';
  return new Response(JSON.stringify({
    id: 're_1234567890abcdef',
    object: 'refund',
    amount: 1250,
    currency: 'aud',
    payment_intent: 'pi_1234567890abcdef',
    charge: 'ch_1234567890abcdef',
    status: 'succeeded'
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch);

const result = await provider.createRefund({
  operationId: '123e4567-e89b-42d3-a456-426614174000',
  paymentIntentId: 'pi_1234567890abcdef',
  amount: '12.50',
  reason: 'requested_by_customer'
});
assert.equal(result.id, 're_1234567890abcdef');
assert.equal(result.amount, 1250);
assert.equal(result.currency, 'AUD');
const form = new URLSearchParams(capturedBody);
assert.equal(form.get('payment_intent'), 'pi_1234567890abcdef');
assert.equal(form.get('amount'), '1250');
assert.equal(form.get('metadata[suqnaa_payment_operation_id]'), '123e4567-e89b-42d3-a456-426614174000');
assert.equal(capturedIdempotencyKey, 'suqnaa-payment-operation-v1-123e4567-e89b-42d3-a456-426614174000');
