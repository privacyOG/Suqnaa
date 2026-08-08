import { db } from '../db/index.js';
import { stripeMinorUnits } from './stripe-checkout-provider.js';
import {
  finalizeSuccessfulRefund,
  recordProviderChargeback
} from './payment-operation-service.js';
import { PaymentOperationError } from './payment-operation.js';
import type { StripeDisputeEvent, StripeRefundEvent } from './stripe-webhook.js';

export async function applyStripeRefundEvent(event: StripeRefundEvent) {
  const refund = event.data.object;
  const operationId = refund.metadata.suqnaa_payment_operation_id;

  if (refund.status === 'succeeded') {
    const result = await finalizeSuccessfulRefund({
      operationId,
      providerReference: refund.id,
      providerPaymentIntentId: refund.payment_intent,
      amountMinor: refund.amount,
      currencyCode: refund.currency.toUpperCase()
    });
    return { ...result, operationId, status: 'succeeded' as const };
  }

  return db.transaction().execute(async (trx) => {
    const operation = await trx.selectFrom('payment_operations').selectAll()
      .where('id', '=', operationId).forUpdate().executeTakeFirst();
    if (!operation) throw new PaymentOperationError('operation_not_found', 404);
    const intent = await trx.selectFrom('payment_intents').select(['provider_reference'])
      .where('id', '=', operation.payment_intent_id).executeTakeFirstOrThrow();
    if (
      intent.provider_reference !== refund.payment_intent ||
      stripeMinorUnits(operation.amount as string | number) !== refund.amount ||
      String(operation.currency_code).toUpperCase() !== refund.currency.toUpperCase() ||
      (operation.provider_reference !== null && operation.provider_reference !== refund.id)
    ) {
      throw new PaymentOperationError('provider_refund_mismatch');
    }

    const terminalFailure = refund.status === 'failed' || refund.status === 'canceled';
    await trx.updateTable('payment_operations').set({
      status: terminalFailure ? 'failed' : 'processing',
      provider_reference: refund.id,
      error_code: terminalFailure ? `refund_${refund.status}` : null,
      completed_at: terminalFailure ? new Date() : null,
      updated_at: new Date()
    }).where('id', '=', operation.id).execute();

    return {
      duplicate: false,
      orderId: String(operation.order_id),
      operationId,
      status: terminalFailure ? 'failed' as const : 'processing' as const
    };
  });
}

export async function applyStripeDisputeEvent(event: StripeDisputeEvent) {
  const dispute = event.data.object;
  const receipt = await db.selectFrom('payment_receipts')
    .innerJoin('payment_intents', 'payment_intents.id', 'payment_receipts.payment_intent_id')
    .select(['payment_intents.provider_reference as provider_payment_reference'])
    .where('payment_receipts.provider', '=', 'stripe')
    .where('payment_receipts.provider_charge_reference', '=', dispute.charge)
    .executeTakeFirst();
  if (!receipt?.provider_payment_reference) {
    throw new PaymentOperationError('provider_dispute_payment_missing');
  }

  return recordProviderChargeback({
    providerEventId: event.id,
    disputeId: dispute.id,
    providerPaymentIntentId: String(receipt.provider_payment_reference),
    amount: (dispute.amount / 100).toFixed(2),
    currencyCode: dispute.currency.toUpperCase(),
    occurredAt: new Date(event.created * 1000)
  });
}
