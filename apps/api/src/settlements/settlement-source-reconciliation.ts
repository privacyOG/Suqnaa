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
      'seller_settlements.provider_transfer_reference as provider_transfer_reference',
      'settlement_reversals.id as reversal_id'
    ])
    .where('payment_operations.status', '=', 'succeeded')
    .where('payment_operations.kind', 'in', ['refund_full', 'refund_partial', 'cancel_after_payment', 'chargeback'])
    .orderBy('payment_operations.completed_at', 'asc')
    .limit(Math.min(limit, 500))
    .execute();
  let processed = 0;
  for (const row of rows) {
    if (row.reversal_id) continue;
    const ledgerReference = `settlement-source:${String(row.operation_id)}`;
    const ledger = await db.selectFrom('settlement_ledger_entries').select(['id'])
      .where('reference', '=', ledgerReference).executeTakeFirst();
    if (ledger) continue;
    const adjustment = Number(row.amount ?? 0);
    if (!Number.isFinite(adjustment) || adjustment <= 0) continue;
    await db.transaction().execute(async (trx) => {
      await recordSettlementAdjustment(trx, {
        paymentIntentId: String(row.payment_intent_id),
        paymentOperationId: String(row.operation_id),
        kind: row.kind === 'chargeback' ? 'chargeback' : 'refund',
        grossAdjustmentAmount: adjustment,
        now: row.completed_at instanceof Date ? row.completed_at : new Date(row.completed_at ?? Date.now())
      });
      const settlement = await trx.selectFrom('seller_settlements').select(['id'])
        .where('payment_intent_id', '=', row.payment_intent_id).executeTakeFirst();
      if (settlement) {
        await trx.insertInto('settlement_ledger_entries').values({
          settlement_id: settlement.id,
          entry_type: 'seller_payable',
          amount: '0.01',
          currency_code: 'AUD',
          reference: ledgerReference,
          created_at: new Date()
        }).execute();
        await trx.deleteFrom('settlement_ledger_entries').where('reference', '=', ledgerReference).execute();
      }
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
