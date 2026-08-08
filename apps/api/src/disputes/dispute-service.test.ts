import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  DisputeWorkflowError,
  appealDispute,
  decideDisputeAppeal,
  openOrderDispute,
  readDisputeDetail,
  reconcileDisputeDeadlines,
  resolveDispute,
  submitDisputeResponse
} from './dispute-service.js';

const buyerId = randomUUID();
const sellerId = randomUUID();
const reviewerId = randomUUID();
const now = new Date('2026-08-08T14:00:00.000Z');
let sequence = 0;

async function createPaidOrder() {
  sequence += 1;
  const listingId = randomUUID();
  const orderId = randomUUID();
  const paymentReference = `pi_dispute_test_${String(sequence).padStart(8, '0')}`;
  await db.insertInto('listings').values({
    id: listingId,
    seller_id: sellerId,
    title: `Dispute test ${sequence}`,
    description: 'Database-backed dispute workflow integration test listing.',
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
  const intent = await db.selectFrom('payment_intents').select(['id'])
    .where('transaction_id', '=', orderId).executeTakeFirstOrThrow();
  await db.updateTable('transactions').set({
    status: 'paid', payment_provider: 'stripe', payment_reference: paymentReference, updated_at: now
  }).where('id', '=', orderId).execute();
  await db.updateTable('payment_intents').set({
    status: 'held', provider: 'stripe', provider_reference: paymentReference, updated_at: now
  }).where('id', '=', intent.id).execute();
  return { orderId, intentId: String(intent.id) };
}

try {
  await db.insertInto('users').values([
    { id: buyerId, email: `dispute-buyer-${buyerId}@example.test`, display_name: 'Dispute Buyer', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: sellerId, email: `dispute-seller-${sellerId}@example.test`, display_name: 'Dispute Seller', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: reviewerId, email: `dispute-reviewer-${reviewerId}@example.test`, display_name: 'Dispute Reviewer', status: 'active', email_verified_at: now, created_at: now, updated_at: now }
  ]).execute();

  const first = await createPaidOrder();
  const opened = await openOrderDispute({
    orderId: first.orderId,
    openedBy: buyerId,
    category: 'non_delivery',
    reason: 'The order has not arrived and the expected delivery window has passed.'
  });
  assert.equal(opened.status, 'awaiting_seller');
  assert.equal(opened.openedByRole, 'buyer');
  assert.equal(opened.respondentUserId, sellerId);

  await assert.rejects(
    openOrderDispute({
      orderId: first.orderId,
      openedBy: sellerId,
      category: 'other',
      reason: 'A second active dispute must not be allowed for the same payment.'
    }),
    (error: unknown) => error instanceof DisputeWorkflowError && error.code === 'active_dispute_exists'
  );

  const response = await submitDisputeResponse({
    disputeId: opened.id,
    submittedBy: sellerId,
    responseText: 'The parcel was shipped and I am providing the available delivery evidence for review.'
  });
  assert.equal(response.status, 'under_review');
  const detail = await readDisputeDetail(opened.id, buyerId);
  assert.equal(detail.responses.length, 1);
  assert.equal(detail.responses[0]?.submittedByUserId, sellerId);

  const resolved = await resolveDispute({
    disputeId: opened.id,
    reviewerId,
    outcome: 'buyer_refund',
    resolutionNotes: 'The evidence does not establish successful delivery and a full buyer refund is requested.',
    hasPaymentRequestPermission: true
  });
  assert.equal(resolved.dispute.status, 'resolved');
  assert.ok(resolved.paymentOperationId);
  const paymentOperation = await db.selectFrom('payment_operations')
    .select(['kind', 'status', 'approved_by'])
    .where('id', '=', resolved.paymentOperationId!).executeTakeFirstOrThrow();
  assert.equal(paymentOperation.kind, 'refund_full');
  assert.equal(paymentOperation.status, 'requested');
  assert.equal(paymentOperation.approved_by, null, 'dispute resolution must not self-approve money movement');
  assert.equal((await db.selectFrom('payment_intents').select('status').where('id', '=', first.intentId).executeTakeFirstOrThrow()).status, 'held');

  const appeal = await appealDispute({
    disputeId: opened.id,
    appealedBy: buyerId,
    reason: 'I am appealing because the recorded outcome requires another review of the submitted evidence.'
  });
  assert.equal(appeal.status, 'pending');
  await assert.rejects(
    decideDisputeAppeal({
      disputeId: opened.id,
      reviewerId: buyerId,
      decision: 'upheld',
      notes: 'An appeal opener cannot decide the appeal that they submitted.'
    }),
    (error: unknown) => error instanceof DisputeWorkflowError && error.code === 'appeal_reviewer_conflict'
  );

  const second = await createPaidOrder();
  const overdue = await openOrderDispute({
    orderId: second.orderId,
    openedBy: sellerId,
    category: 'pickup_issue',
    reason: 'The pickup transaction requires review because the other participant has not responded.'
  });
  await db.updateTable('disputes').set({ response_due_at: new Date(Date.now() - 60_000) })
    .where('id', '=', overdue.id).execute();
  assert.equal(await reconcileDisputeDeadlines(10), 1);
  const overdueRow = await db.selectFrom('disputes').select(['status', 'escalation_level'])
    .where('id', '=', overdue.id).executeTakeFirstOrThrow();
  assert.equal(overdueRow.status, 'under_review');
  assert.equal(Number(overdueRow.escalation_level), 1);

  console.log('dispute workflow database tests passed');
} finally {
  await closeDb();
}
