import { db } from '../db/index.js';
import {
  ensureSettlementForReleasedPayment,
  recordSettlementAdjustment
} from './seller-settlement-service.js';

export async function reconcileReleasedPayments(limit = 100): Promise<number> {
  const rows = await db.selectFrom('payment_intents')
    .innerJoin('transactions', 'transactions.id', 'payment_intents.transaction_id')
    .leftJoin('seller_settlements', 'seller_settlements.payment_intent_id', 'payment_intents.id')
    .select(['payment_intents.id as payment_intent_id', 'transactions.id as order_id'])
    .where('payment_intents.status', '=', 'released')
    .where('transactions.status', '=', 'released')
    .where('seller_settlements.id', 'is', null)
    .orderBy('payment_intents.updated_at', 'asc')
    .limit(Math.min(limit, 500))
    .execute();
  let processed = 0;
  for (const row of rows) {
    await db.transaction().execute(async (trx) => {
      await ensureSettlementForReleasedPayment(trx, {
        orderId: String(row.order_id),
        paymentIntentId: String(row.payment_intent_id),
        now: new Date()
      });
    });
    processed += 1;
  }
  return processed;
}

export async function reconcilePaymentAdjustments(limit = 100): Promise<number> {
  const rows = await db.selectFrom('payment_operations')
    .innerJoin('seller_settlements', 'seller_settlements.payment_intent_id', 'payment_operations.payment_intent_id')
    .leftJoin('settlement_reversals', 'settlement_reversals.payment_operation_id', 'payment_operations.id')
    .select([
      'payment_operations.id as operation_id',
      'payment_operations.payment_intent_id as payment_intent_id',
      'payment_operations.kind as kind',
      'payment_operations.amount as amount',
      'payment_operations.completed_at as completed_at',
      'settlement_reversals.id as reversal_id'
    ])
    .where('payment_operations.status', '=', 'succeeded')
    .where('payment_operations.kind', 'in', ['refund_full', 'refund_partial', 'cancel_after_payment', 'chargeback'])
    .orderBy('payment_operations.completed_at', 'asc')
    .limit(Math.min(limit, 500))
    .execute();
  let processed = 0;
  for (const row of rows) {
    if (row.reversal_id || !row.completed_at) continue;
    const eventTime = row.completed_at instanceof Date ? row.completed_at : new Date(row.completed_at);
    const adjustmentKind = row.kind === 'chargeback' ? 'chargeback' : 'refund';
    const ledgerReference = `${adjustmentKind}:${String(row.operation_id)}:${eventTime.getTime()}`;
    const ledger = await db.selectFrom('settlement_ledger_entries').select(['id'])
      .where('reference', '=', ledgerReference).executeTakeFirst();
    if (ledger) continue;
    const adjustment = Number(row.amount ?? 0);
    if (!Number.isFinite(adjustment) || adjustment <= 0) continue;
    await db.transaction().execute(async (trx) => {
      await recordSettlementAdjustment(trx, {
        paymentIntentId: String(row.payment_intent_id),
        paymentOperationId: String(row.operation_id),
        kind: adjustmentKind,
        grossAdjustmentAmount: adjustment,
        now: eventTime
      });
    });
    processed += 1;
  }
  return processed;
}

export async function reconcileSettlementSources(limit = 100) {
  const released = await reconcileReleasedPayments(limit);
  const adjustments = await reconcilePaymentAdjustments(limit);
  return { released, adjustments };
}
