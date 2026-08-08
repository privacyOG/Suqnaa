import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';
import type { SellerSettlementConfiguration } from '../config/seller-settlement-config.js';
import { closeDb, db } from '../db/index.js';
import { StripeConnectProvider } from '../payments/stripe-connect-provider.js';
import { reconcilePaymentAdjustments } from './settlement-source-reconciliation.js';
import {
  applyStripeConnectEvent,
  ensureSettlementForReleasedPayment,
  runSellerSettlementBatch
} from './seller-settlement-service.js';

process.env.SELLER_SETTLEMENT_ENABLED = 'true';
process.env.SELLER_SETTLEMENT_LIVE_APPROVED = 'false';
process.env.SELLER_SETTLEMENT_COMMISSION_BPS = '750';
process.env.SELLER_SETTLEMENT_DELAY_DAYS = '0';
process.env.SELLER_SETTLEMENT_PAYOUT_INTERVAL = 'weekly';
process.env.SELLER_SETTLEMENT_PAYOUT_ANCHOR = 'friday';
process.env.SELLER_SETTLEMENT_WORKER_BATCH_SIZE = '20';
process.env.SELLER_SETTLEMENT_WORKER_INTERVAL_MS = '15000';
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_1234567890abcdef';

const now = new Date('2026-08-08T14:00:00.000Z');
const buyerId = randomUUID();
const sellerId = randomUUID();
const requesterId = randomUUID();
const listingId = randomUUID();
const orderId = randomUUID();
const paymentReference = 'pi_test_settlement_12345678';
const chargeReference = 'ch_test_settlement_12345678';
const accountReference = 'acct_test_settlement_12345678';

const paymentConfiguration: PaymentCollectionConfiguration = {
  enabled: true, provider: 'stripe', liveMode: false,
  secretKey: 'sk_test_1234567890abcdef', webhookSecret: 'whsec_1234567890abcdef',
  apiBaseUrl: 'https://api.stripe.com', apiVersion: '2026-02-25.clover',
  timeoutMs: 5000, webOrigin: 'https://suqnaa.example'
};
const settlementConfiguration: SellerSettlementConfiguration = {
  enabled: true, liveApproved: false, commissionBps: 750, settlementDelayDays: 0,
  payoutInterval: 'weekly', payoutAnchor: 'friday', workerBatchSize: 20,
  workerIntervalMs: 15000, connectWebhookSecret: 'whsec_connect_1234567890abcdef'
};

let transferCount = 0;
let reversalCount = 0;
const provider = new StripeConnectProvider(paymentConfiguration, settlementConfiguration, (async (url, init) => {
  const path = new URL(String(url)).pathname;
  const form = new URLSearchParams(String(init?.body ?? ''));
  if (path === '/v1/transfers') {
    transferCount += 1;
    return new Response(JSON.stringify({
      id: `tr_test_settlement_${String(transferCount).padStart(8, '0')}`,
      amount: Number(form.get('amount')), currency: 'aud',
      destination: form.get('destination'), source_transaction: form.get('source_transaction'),
      transfer_group: form.get('transfer_group')
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path.endsWith('/reversals')) {
    reversalCount += 1;
    return new Response(JSON.stringify({
      id: `trr_test_settlement_${String(reversalCount).padStart(8, '0')}`,
      transfer: path.split('/')[3], amount: Number(form.get('amount')), currency: 'aud'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected settlement provider request ${path}`);
}) as typeof fetch);

let intentId = '';
let payoutAccountId = '';
try {
  await db.insertInto('users').values([
    { id: buyerId, email: `settlement-buyer-${buyerId}@example.test`, display_name: 'Settlement Buyer', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: sellerId, email: `settlement-seller-${sellerId}@example.test`, display_name: 'Settlement Seller', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: requesterId, email: `settlement-requester-${requesterId}@example.test`, display_name: 'Settlement Requester', status: 'active', email_verified_at: now, created_at: now, updated_at: now }
  ]).execute();
  await db.insertInto('listings').values({
    id: listingId, seller_id: sellerId, title: 'Settlement test listing',
    description: 'Seller settlement database integration test listing.', price_amount: '100.00',
    currency_code: 'AUD', condition: 'good', availability_status: 'in_stock', available_quantity: 1,
    status: 'reserved', country_code: 'AU', allow_pickup: true, allow_delivery: false,
    published_at: now, created_at: now, updated_at: now
  }).execute();
  await db.insertInto('transactions').values({
    id: orderId, listing_id: listingId, buyer_id: buyerId, seller_id: sellerId,
    amount: '100.00', currency_code: 'AUD', status: 'pending', payment_method: 'card',
    client_order_id: randomUUID(), created_at: now, updated_at: now
  }).execute();
  const intent = await db.selectFrom('payment_intents').select(['id']).where('transaction_id', '=', orderId).executeTakeFirstOrThrow();
  intentId = String(intent.id);
  await db.updateTable('transactions').set({
    status: 'released', payment_provider: 'stripe', payment_reference: paymentReference, updated_at: now
  }).where('id', '=', orderId).execute();
  await db.updateTable('payment_intents').set({
    status: 'released', provider: 'stripe', provider_reference: paymentReference, updated_at: now
  }).where('id', '=', intentId).execute();
  await db.insertInto('payment_receipts').values({
    payment_intent_id: intentId, provider: 'stripe', provider_payment_reference: paymentReference,
    provider_charge_reference: chargeReference, receipt_url: 'https://pay.stripe.com/receipts/settlement-test',
    receipt_number: 'SETTLE-1', issued_at: now
  }).execute();
  const payoutAccount = await db.insertInto('seller_payout_accounts').values({
    seller_id: sellerId, provider: 'stripe', provider_account_reference: accountReference,
    country_code: 'AU', default_currency: 'AUD', onboarding_status: 'ready', transfers_enabled: true,
    payouts_enabled: true, details_submitted: true, requirements_due: 0,
    payout_interval: 'weekly', payout_anchor: 'friday', last_provider_sync_at: now,
    created_at: now, updated_at: now
  }).returning(['id']).executeTakeFirstOrThrow();
  payoutAccountId = String(payoutAccount.id);

  await db.transaction().execute((trx) => ensureSettlementForReleasedPayment(trx, { orderId, paymentIntentId: intentId, now }));
  let settlement = await db.selectFrom('seller_settlements').selectAll().where('order_id', '=', orderId).executeTakeFirstOrThrow();
  assert.equal(Number(settlement.gross_amount).toFixed(2), '100.00');
  assert.equal(Number(settlement.commission_amount).toFixed(2), '7.50');
  assert.equal(Number(settlement.net_amount).toFixed(2), '92.50');
  assert.equal(settlement.status, 'scheduled');
  const initialLedger = await db.selectFrom('settlement_ledger_entries').select(['entry_type', 'amount'])
    .where('settlement_id', '=', settlement.id).orderBy('created_at').execute();
  assert.deepEqual(initialLedger.map((row) => [row.entry_type, Number(row.amount).toFixed(2)]), [
    ['gross_sale', '100.00'], ['platform_commission', '-7.50'], ['seller_payable', '92.50']
  ]);

  const transferRun = await runSellerSettlementBatch({ limit: 10, provider });
  assert.equal(transferRun.processedTransfers, 1);
  settlement = await db.selectFrom('seller_settlements').selectAll().where('order_id', '=', orderId).executeTakeFirstOrThrow();
  assert.equal(settlement.status, 'transferred');
  assert.match(String(settlement.provider_transfer_reference), /^tr_test_settlement_/);
  assert.equal(transferCount, 1);

  const refundOperationId = randomUUID();
  await db.insertInto('payment_operations').values({
    id: refundOperationId, order_id: orderId, payment_intent_id: intentId,
    kind: 'refund_partial', source: 'operations', status: 'succeeded', amount: '25.00', currency_code: 'AUD',
    reason: 'Post-settlement partial refund for reversal coverage.', requested_by: requesterId,
    approved_by: buyerId, provider_reference: 're_test_settlement_12345678',
    idempotency_key: `payment-operation-v1-${refundOperationId}`,
    requested_at: now, decided_at: now, completed_at: now, updated_at: now
  }).execute();
  assert.equal(await reconcilePaymentAdjustments(20), 1);
  let reversal = await db.selectFrom('settlement_reversals').selectAll().where('payment_operation_id', '=', refundOperationId).executeTakeFirstOrThrow();
  assert.equal(Number(reversal.amount).toFixed(2), '23.12');
  assert.equal(reversal.status, 'pending');

  const reversalRun = await runSellerSettlementBatch({ limit: 10, provider });
  assert.equal(reversalRun.processedReversals, 1);
  reversal = await db.selectFrom('settlement_reversals').selectAll().where('id', '=', reversal.id).executeTakeFirstOrThrow();
  assert.equal(reversal.status, 'succeeded');
  settlement = await db.selectFrom('seller_settlements').selectAll().where('order_id', '=', orderId).executeTakeFirstOrThrow();
  assert.equal(settlement.status, 'partially_reversed');
  assert.equal(reversalCount, 1);
  assert.equal(await reconcilePaymentAdjustments(20), 0);

  const failedEvent = {
    id: 'evt_test_payout_fail_12345678', object: 'event' as const, created: Math.floor(now.getTime() / 1000), livemode: false,
    account: accountReference, type: 'payout.failed' as const,
    data: { object: { id: 'po_test_payout_12345678', object: 'payout' as const, amount: 9250, currency: 'aud', status: 'failed' as const, failure_code: 'account_closed' } }
  };
  const applied = await applyStripeConnectEvent(failedEvent);
  assert.equal(applied.duplicate, false);
  assert.equal((await applyStripeConnectEvent(failedEvent)).duplicate, true);
  const accountAfterFailure = await db.selectFrom('seller_payout_accounts').select(['onboarding_status', 'payouts_enabled', 'disabled_reason'])
    .where('id', '=', payoutAccountId).executeTakeFirstOrThrow();
  assert.equal(accountAfterFailure.onboarding_status, 'restricted');
  assert.equal(accountAfterFailure.payouts_enabled, false);
  assert.equal(accountAfterFailure.disabled_reason, 'account_closed');
} finally {
  if (intentId) {
    await db.deleteFrom('settlement_ledger_entries').where('settlement_id', 'in', db.selectFrom('seller_settlements').select('id').where('payment_intent_id', '=', intentId)).execute();
    await db.deleteFrom('settlement_reversals').where('settlement_id', 'in', db.selectFrom('seller_settlements').select('id').where('payment_intent_id', '=', intentId)).execute();
    await db.deleteFrom('seller_payout_events').where('payout_account_id', '=', payoutAccountId).execute();
    await db.deleteFrom('seller_settlements').where('payment_intent_id', '=', intentId).execute();
    await db.deleteFrom('payment_operations').where('payment_intent_id', '=', intentId).execute();
    await db.deleteFrom('payment_receipts').where('payment_intent_id', '=', intentId).execute();
    await db.deleteFrom('fulfilments').where('payment_intent_id', '=', intentId).execute();
    await db.deleteFrom('payment_intents').where('id', '=', intentId).execute();
  }
  if (payoutAccountId) await db.deleteFrom('seller_payout_accounts').where('id', '=', payoutAccountId).execute();
  await db.deleteFrom('transactions').where('id', '=', orderId).execute();
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  await db.deleteFrom('users').where('id', 'in', [buyerId, sellerId, requesterId]).execute();
  await closeDb();
}

console.log('Seller settlement database integration tests passed.');
