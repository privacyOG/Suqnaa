import { db } from '../db/index.js';
import { observeMarketplaceRiskEvent } from './marketplace-risk-service.js';

export async function reconcileSellerAdverseOutcomes() {
  const disputes = await db.selectFrom('disputes')
    .innerJoin('transactions', 'transactions.id', 'disputes.order_id')
    .select([
      'disputes.id as id',
      'disputes.order_id as order_id',
      'disputes.outcome as outcome',
      'transactions.seller_id as seller_id'
    ])
    .where('disputes.status', 'in', ['resolved', 'closed'])
    .where('disputes.outcome', 'in', ['buyer_refund', 'partial_refund', 'return_required'])
    .execute();

  const protectionEvents = await db.selectFrom('protection_events')
    .innerJoin('order_protection_cases', 'order_protection_cases.id', 'protection_events.protection_case_id')
    .innerJoin('transactions', 'transactions.id', 'order_protection_cases.order_id')
    .select([
      'protection_events.id as id',
      'protection_events.event_type as event_type',
      'order_protection_cases.order_id as order_id',
      'transactions.seller_id as seller_id'
    ])
    .where('protection_events.event_type', 'in', ['refund_requested', 'protection_escalated'])
    .execute();

  const payoutEvents = await db.selectFrom('seller_payout_events')
    .innerJoin('seller_payout_accounts', 'seller_payout_accounts.id', 'seller_payout_events.payout_account_id')
    .select([
      'seller_payout_events.id as id',
      'seller_payout_events.event_type as event_type',
      'seller_payout_events.failure_code as failure_code',
      'seller_payout_accounts.seller_id as seller_id'
    ])
    .where('seller_payout_events.event_type', 'in', ['payout.failed', 'payout.canceled', 'transfer.reversed'])
    .execute();

  for (const dispute of disputes) {
    await observeMarketplaceRiskEvent({
      eventType: 'seller.adverse_outcome',
      sourceEventId: `dispute:${dispute.id}`,
      userId: String(dispute.seller_id),
      orderId: String(dispute.order_id),
      summary: `Seller adverse dispute outcome: ${dispute.outcome}`,
      evidence: { source: 'dispute', outcome: dispute.outcome }
    });
  }

  for (const event of protectionEvents) {
    await observeMarketplaceRiskEvent({
      eventType: 'seller.adverse_outcome',
      sourceEventId: `protection-event:${event.id}`,
      userId: String(event.seller_id),
      orderId: String(event.order_id),
      summary: `Seller adverse protection outcome: ${event.event_type}`,
      evidence: { source: 'protection', eventType: event.event_type }
    });
  }

  for (const event of payoutEvents) {
    await observeMarketplaceRiskEvent({
      eventType: 'seller.adverse_outcome',
      sourceEventId: `payout-event:${event.id}`,
      userId: String(event.seller_id),
      summary: `Seller adverse payout outcome: ${event.event_type}`,
      evidence: {
        source: 'payout',
        eventType: event.event_type,
        failureCode: event.failure_code ?? null
      }
    });
  }

  return {
    disputesObserved: disputes.length,
    protectionEventsObserved: protectionEvents.length,
    payoutEventsObserved: payoutEvents.length
  };
}
