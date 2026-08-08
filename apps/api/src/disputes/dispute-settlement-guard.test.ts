import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import { openOrderDispute } from './dispute-service.js';

const buyerId = randomUUID();
const sellerId = randomUUID();
const listingId = randomUUID();
const orderId = randomUUID();
const payoutAccountId = randomUUID();
const settlementId = randomUUID();
const now = new Date('2026-08-08T15:00:00.000Z');

try {
  await db.insertInto('users').values([
    { id: buyerId, email: `guard-buyer-${buyerId}@example.test`, display_name: 'Guard Buyer', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: sellerId, email: `guard-seller-${sellerId}@example.test`, display_name: 'Guard Seller', status: 'active', email_verified_at: now, created_at: now, updated_at: now }
  ]).execute();
  await db.insertInto('listings').values({
    id: listingId, seller_id: sellerId, title: 'Settlement guard listing', description: 'Active dispute settlement guard integration test.',
    price_amount: '100.00', currency_code: 'AUD', condition: 'good', availability_status: 'in_stock', available_quantity: 1,
    status: 'reserved', country_code: 'AU', allow_pickup: true, allow_delivery: false, published_at: now, created_at: now, updated_at: now
  }).execute();
  await db.insertInto('transactions').values({
    id: orderId, listing_id: listingId, buyer_id: buyerId, seller_id: sellerId, amount: '100.00', currency_code: 'AUD', status: 'pending',
    payment_method: 'card', client_order_id: randomUUID(), created_at: now, updated_at: now
  }).execute();
  const intent = await db.selectFrom('payment_intents').select(['id']).where('transaction_id', '=', orderId).executeTakeFirstOrThrow();
  await db.updateTable('transactions').set({ status: 'paid', payment_provider: 'stripe', payment_reference: 'pi_guard_12345678', updated_at: now }).where('id', '=', orderId).execute();
  await db.updateTable('payment_intents').set({ status: 'held', provider: 'stripe', provider_reference: 'pi_guard_12345678', updated_at: now }).where('id', '=', intent.id).execute();
  await db.insertInto('seller_payout_accounts').values({
    id: payoutAccountId, seller_id: sellerId, provider: 'stripe', provider_account_reference: 'acct_guard_12345678', country_code: 'AU', default_currency: 'AUD',
    onboarding_status: 'ready', transfers_enabled: true, payouts_enabled: true, details_submitted: true, requirements_due: 0,
    payout_interval: 'weekly', payout_anchor: 'monday', created_at: now, updated_at: now
  }).execute();

  const dispute = await openOrderDispute({
    orderId, openedBy: buyerId, category: 'non_delivery', reason: 'Seller settlement must remain blocked while this marketplace dispute is active.'
  });
  assert.equal(dispute.status, 'awaiting_seller');

  await db.insertInto('seller_settlements').values({
    id: settlementId, order_id: orderId, payment_intent_id: intent.id, seller_id: sellerId, payout_account_id: payoutAccountId,
    gross_amount: '100.00', commission_bps: 500, commission_amount: '5.00', net_amount: '95.00', currency_code: 'AUD', status: 'scheduled',
    source_charge_reference: 'ch_guard_12345678', transfer_idempotency_key: `guard-settlement-${settlementId}`, available_at: now, created_at: now, updated_at: now
  }).execute();
  assert.equal((await db.selectFrom('seller_settlements').select('status').where('id', '=', settlementId).executeTakeFirstOrThrow()).status, 'blocked');

  await db.updateTable('seller_settlements').set({ status: 'processing', updated_at: new Date() }).where('id', '=', settlementId).execute();
  assert.equal((await db.selectFrom('seller_settlements').select('status').where('id', '=', settlementId).executeTakeFirstOrThrow()).status, 'blocked');

  console.log('active dispute settlement guard test passed');
} finally {
  await closeDb();
}
