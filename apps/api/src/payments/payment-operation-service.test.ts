import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';
import { closeDb, db } from '../db/index.js';
import {
  decidePaymentOperation,
  recordProviderChargeback,
  requestPaymentOperation
} from './payment-operation-service.js';
import { PaymentOperationError } from './payment-operation.js';
import { StripePaymentOperationsProvider } from './stripe-payment-operations.js';

const requesterId = randomUUID();
const approverId = randomUUID();
const buyerId = randomUUID();
const sellerId = randomUUID();
const now = new Date('2026-08-08T12:00:00.000Z');
const createdListingIds: string[] = [];
const createdOrderIds: string[] = [];
let refundCounter = 0;

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

const refundProvider = new StripePaymentOperationsProvider(configuration, (async (_url, init) => {
  refundCounter += 1;
  const form = new URLSearchParams(String(init?.body ?? ''));
  return new Response(JSON.stringify({
    id: `re_test_refund_${String(refundCounter).padStart(8, '0')}`,
    object: 'refund',
    amount: Number(form.get('amount')),
    currency: 'aud',
    payment_intent: form.get('payment_intent'),
    charge: `ch_test_charge_${String(refundCounter).padStart(8, '0')}`,
    status: 'succeeded'
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch);

async function createPaidOrder(index: number) {
  const listingId = randomUUID();
  const orderId = randomUUID();
  const paymentReference = `pi_test_payment_${String(index).padStart(8, '0')}`;
  const chargeReference = `ch_test_original_${String(index).padStart(8, '0')}`;
  createdListingIds.push(listingId);
  createdOrderIds.push(orderId);

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: sellerId,
    title: `Payment transition ${index}`,
    description: 'Payment operation database integration test listing.',
    price_amount: '100.00',
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
    amount: '100.00',
    currency_code: 'AUD',
    status: 'pending',
    payment_method: 'card',
    client_order_id: randomUUID(),
    created_at: now,
    updated_at: now
  }).execute();

  const intent = await db.selectFrom('payment_intents')
    .select(['id'])
    .where('transaction_id', '=', orderId)
    .executeTakeFirstOrThrow();

  await db.updateTable('transactions').set({
    status: 'paid',
    payment_provider: 'stripe',
    payment_reference: paymentReference,
    updated_at: now
  }).where('id', '=', orderId).execute();
  await db.updateTable('payment_intents').set({
    status: 'held',
    provider: 'stripe',
    provider_reference: paymentReference,
    updated_at: now
  }).where('id', '=', intent.id).execute();
  await db.insertInto('payment_receipts').values({
    payment_intent_id: intent.id,
    provider: 'stripe',
    provider_payment_reference: paymentReference,
    provider_charge_reference: chargeReference,
    receipt_url: `https://pay.stripe.com/receipts/test/${index}`,
    receipt_number: `TEST-${index}`,
    issued_at: now
  }).execute();

  return { orderId, intentId: String(intent.id), paymentReference };
}

try {
  await db.insertInto('users').values([
    { id: requesterId, email: `payment-requester-${requesterId}@example.test`, display_name: 'Payment Requester', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: approverId, email: `payment-approver-${approverId}@example.test`, display_name: 'Payment Approver', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: buyerId, email: `payment-buyer-${buyerId}@example.test`, display_name: 'Payment Buyer', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: sellerId, email: `payment-seller-${sellerId}@example.test`, display_name: 'Payment Seller', status: 'active', email_verified_at: now, created_at: now, updated_at: now }
  ]).execute();

  const first = await createPaidOrder(1);
  const release = await requestPaymentOperation({
    orderId: first.orderId,
    kind: 'release',
    reason: 'Fulfilment evidence supports seller settlement release.',
    requestedBy: requesterId
  });
  await assert.rejects(
    decidePaymentOperation({
      operationId: String(release.id),
      decision: 'approve',
      decidedBy: requesterId,
      decisionReason: 'Requester must not approve their own operation.',
      provider: refundProvider
    }),
    (error: unknown) => error instanceof PaymentOperationError && error.code === 'separation_of_duties_required'
  );
  await decidePaymentOperation({
    operationId: String(release.id),
    decision: 'approve',
    decidedBy: approverId,
    decisionReason: 'Independent reviewer approved settlement eligibility.',
    provider: refundProvider
  });
  assert.equal((await db.selectFrom('transactions').select('status').where('id', '=', first.orderId).executeTakeFirstOrThrow()).status, 'released');

  const hold = await requestPaymentOperation({
    orderId: first.orderId,
    kind: 'compliance_hold',
    reason: 'Compliance review requires settlement to stop before payout.',
    requestedBy: requesterId
  });
  await decidePaymentOperation({
    operationId: String(hold.id),
    decision: 'approve',
    decidedBy: approverId,
    decisionReason: 'Independent reviewer confirmed the compliance hold.',
    provider: refundProvider
  });
  assert.equal((await db.selectFrom('payment_intents').select('status').where('id', '=', first.intentId).executeTakeFirstOrThrow()).status, 'compliance_hold');
  assert.equal((await db.selectFrom('transactions').select('status').where('id', '=', first.orderId).executeTakeFirstOrThrow()).status, 'paid');

  const partial = await requestPaymentOperation({
    orderId: first.orderId,
    kind: 'refund_partial',
    amount: '25.00',
    reason: 'Independent review approved a twenty five dollar partial refund.',
    requestedBy: requesterId
  });
  await decidePaymentOperation({
    operationId: String(partial.id),
    decision: 'approve',
    decidedBy: approverId,
    decisionReason: 'Refund amount and evidence were independently checked.',
    provider: refundProvider
  });
  assert.equal((await db.selectFrom('payment_intents').select('status').where('id', '=', first.intentId).executeTakeFirstOrThrow()).status, 'compliance_hold');

  const remainder = await requestPaymentOperation({
    orderId: first.orderId,
    kind: 'refund_full',
    reason: 'Remaining balance is approved for a complete customer refund.',
    requestedBy: requesterId
  });
  await decidePaymentOperation({
    operationId: String(remainder.id),
    decision: 'approve',
    decidedBy: approverId,
    decisionReason: 'Independent reviewer approved refunding the remaining balance.',
    provider: refundProvider
  });
  const remainingOperation = await db.selectFrom('payment_operations').select(['amount', 'status']).where('id', '=', remainder.id).executeTakeFirstOrThrow();
  assert.equal(Number(remainingOperation.amount).toFixed(2), '75.00');
  assert.equal(remainingOperation.status, 'succeeded');
  assert.equal((await db.selectFrom('transactions').select('status').where('id', '=', first.orderId).executeTakeFirstOrThrow()).status, 'refunded');

  const second = await createPaidOrder(2);
  const cancellation = await requestPaymentOperation({
    orderId: second.orderId,
    kind: 'cancel_after_payment',
    reason: 'Post-payment cancellation is accepted with a complete refund.',
    requestedBy: requesterId
  });
  await decidePaymentOperation({
    operationId: String(cancellation.id),
    decision: 'approve',
    decidedBy: approverId,
    decisionReason: 'Independent reviewer approved cancellation and full refund.',
    provider: refundProvider
  });
  assert.equal((await db.selectFrom('transactions').select('status').where('id', '=', second.orderId).executeTakeFirstOrThrow()).status, 'cancelled');
  assert.equal((await db.selectFrom('payment_intents').select('status').where('id', '=', second.intentId).executeTakeFirstOrThrow()).status, 'refunded');

  const third = await createPaidOrder(3);
  const chargeback = await recordProviderChargeback({
    providerEventId: 'evt_test_dispute_00000001',
    disputeId: 'dp_test_dispute_00000001',
    providerPaymentIntentId: third.paymentReference,
    amount: '100.00',
    currencyCode: 'AUD',
    occurredAt: now
  });
  assert.equal(chargeback.duplicate, false);
  assert.equal((await db.selectFrom('transactions').select('status').where('id', '=', third.orderId).executeTakeFirstOrThrow()).status, 'disputed');
  assert.equal((await recordProviderChargeback({
    providerEventId: 'evt_test_dispute_00000001',
    disputeId: 'dp_test_dispute_00000001',
    providerPaymentIntentId: third.paymentReference,
    amount: '100.00',
    currencyCode: 'AUD',
    occurredAt: now
  })).duplicate, true);
} finally {
  await db.deleteFrom('payment_operations').where('order_id', 'in', createdOrderIds).execute();
  await db.deleteFrom('payment_receipts').where('payment_intent_id', 'in', db.selectFrom('payment_intents').select('id').where('transaction_id', 'in', createdOrderIds)).execute();
  await db.deleteFrom('transactions').where('id', 'in', createdOrderIds).execute();
  await db.deleteFrom('listings').where('id', 'in', createdListingIds).execute();
  await db.deleteFrom('users').where('id', 'in', [requesterId, approverId, buyerId, sellerId]).execute();
  await closeDb();
}
