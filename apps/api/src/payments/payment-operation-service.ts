import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import type { PaymentStatus, TransactionStatus } from '../db/types.js';
import {
  type RequestedPaymentOperationKind,
  PaymentOperationError,
  operationRequiresProviderRefund,
  validateOperationInput
} from './payment-operation.js';
import { stripeMinorUnits, StripeProviderError } from './stripe-checkout-provider.js';
import {
  StripePaymentOperationsProvider,
  type StripeRefundResult
} from './stripe-payment-operations.js';

interface RefundWork {
  operationId: string;
  kind: RequestedPaymentOperationKind;
  paymentIntentId: string;
  internalPaymentIntentId: string;
  orderId: string;
  amount: string;
  currencyCode: string;
}

function decimal(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new PaymentOperationError('invalid_amount');
  return Math.round(parsed * 100) / 100;
}

async function refundedAmount(executor: any, paymentIntentId: string, excludeId?: string): Promise<number> {
  let query = executor.selectFrom('payment_operations')
    .select(sql<string>`coalesce(sum(amount), 0)`.as('refunded'))
    .where('payment_intent_id', '=', paymentIntentId)
    .where('kind', 'in', ['refund_full', 'refund_partial', 'cancel_after_payment'])
    .where('status', '=', 'succeeded');
  if (excludeId) query = query.where('id', '!=', excludeId);
  const row = await query.executeTakeFirstOrThrow();
  return decimal(row.refunded);
}

function assertRequestState(
  kind: RequestedPaymentOperationKind,
  intentStatus: PaymentStatus,
  orderStatus: TransactionStatus
): void {
  if (kind === 'release') {
    if (intentStatus !== 'held' && intentStatus !== 'compliance_hold') {
      throw new PaymentOperationError('release_state_invalid');
    }
    if (orderStatus !== 'paid') throw new PaymentOperationError('release_order_invalid');
    return;
  }

  if (kind === 'compliance_hold') {
    if (intentStatus !== 'held' && intentStatus !== 'released') {
      throw new PaymentOperationError('hold_state_invalid');
    }
    if (orderStatus !== 'paid' && orderStatus !== 'released') {
      throw new PaymentOperationError('hold_order_invalid');
    }
    return;
  }

  if (!['held', 'released', 'compliance_hold'].includes(intentStatus)) {
    throw new PaymentOperationError('refund_state_invalid');
  }
  if (orderStatus !== 'paid' && orderStatus !== 'released') {
    throw new PaymentOperationError('refund_order_invalid');
  }
}

export async function requestPaymentOperation(input: {
  orderId: string;
  kind: RequestedPaymentOperationKind;
  amount?: string | number | null;
  reason: string;
  requestedBy: string;
  ipAddress?: string;
}) {
  const normalized = validateOperationInput(input);
  const operationId = randomUUID();

  return db.transaction().execute(async (trx) => {
    const order = await trx.selectFrom('transactions')
      .select(['id', 'status', 'amount', 'currency_code', 'payment_provider', 'payment_reference'])
      .where('id', '=', input.orderId)
      .forUpdate()
      .executeTakeFirst();
    if (!order) throw new PaymentOperationError('order_not_found', 404);

    const intent = await trx.selectFrom('payment_intents')
      .select(['id', 'transaction_id', 'status', 'amount', 'currency_code', 'provider', 'provider_reference'])
      .where('transaction_id', '=', order.id)
      .forUpdate()
      .executeTakeFirst();
    if (!intent || intent.transaction_id !== order.id) {
      throw new PaymentOperationError('payment_context_missing');
    }
    if (
      decimal(intent.amount) !== decimal(order.amount) ||
      String(intent.currency_code).toUpperCase() !== String(order.currency_code).toUpperCase()
    ) {
      throw new PaymentOperationError('payment_context_inconsistent');
    }

    assertRequestState(input.kind, intent.status as PaymentStatus, order.status as TransactionStatus);

    if (operationRequiresProviderRefund(input.kind)) {
      if (
        intent.provider !== 'stripe' ||
        order.payment_provider !== 'stripe' ||
        typeof intent.provider_reference !== 'string' ||
        intent.provider_reference !== order.payment_reference
      ) {
        throw new PaymentOperationError('provider_reference_missing');
      }
      const alreadyRefunded = await refundedAmount(trx, String(intent.id));
      const remaining = decimal(order.amount) - alreadyRefunded;
      if (remaining <= 0) throw new PaymentOperationError('already_fully_refunded');
      if (normalized.amount !== null && decimal(normalized.amount) > remaining) {
        throw new PaymentOperationError('refund_exceeds_remaining', 400);
      }
    }

    const operation = await trx.insertInto('payment_operations').values({
      id: operationId,
      order_id: order.id,
      payment_intent_id: intent.id,
      kind: input.kind,
      source: 'operations',
      status: 'requested',
      amount: normalized.amount,
      currency_code: String(order.currency_code).toUpperCase(),
      reason: normalized.reason,
      requested_by: input.requestedBy,
      idempotency_key: `payment-operation-v1-${operationId}`,
      requested_at: new Date(),
      updated_at: new Date()
    }).returning(['id', 'kind', 'status', 'amount', 'currency_code', 'requested_at'])
      .executeTakeFirstOrThrow();

    await trx.insertInto('audit_logs').values({
      actor_user_id: input.requestedBy,
      action: 'payments.operation.request',
      entity_type: 'payment_operation',
      entity_id: operation.id,
      ip_address: input.ipAddress ?? null,
      metadata: { orderId: order.id, kind: input.kind, amount: normalized.amount },
      created_at: new Date()
    }).execute();

    return operation;
  });
}

async function applyInternalOperation(trx: any, operation: any, now: Date): Promise<void> {
  const intent = await trx.selectFrom('payment_intents')
    .select(['id', 'status'])
    .where('id', '=', operation.payment_intent_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const order = await trx.selectFrom('transactions')
    .select(['id', 'status'])
    .where('id', '=', operation.order_id)
    .forUpdate()
    .executeTakeFirstOrThrow();

  if (operation.kind === 'release') {
    assertRequestState('release', intent.status as PaymentStatus, order.status as TransactionStatus);
    await trx.updateTable('payment_intents')
      .set({ status: 'released', updated_at: now })
      .where('id', '=', intent.id)
      .execute();
    await trx.updateTable('transactions')
      .set({ status: 'released', updated_at: now })
      .where('id', '=', order.id)
      .execute();
  } else if (operation.kind === 'compliance_hold') {
    assertRequestState('compliance_hold', intent.status as PaymentStatus, order.status as TransactionStatus);
    await trx.updateTable('payment_intents')
      .set({ status: 'compliance_hold', updated_at: now })
      .where('id', '=', intent.id)
      .execute();
    if (order.status === 'released') {
      await trx.updateTable('transactions')
        .set({ status: 'paid', updated_at: now })
        .where('id', '=', order.id)
        .execute();
    }
  } else {
    throw new PaymentOperationError('internal_operation_invalid');
  }

  await trx.updateTable('payment_operations').set({
    status: 'succeeded',
    completed_at: now,
    updated_at: now
  }).where('id', '=', operation.id).execute();
}

async function prepareRefundApproval(
  trx: any,
  operation: any,
  approverId: string,
  now: Date
): Promise<RefundWork> {
  const intent = await trx.selectFrom('payment_intents')
    .select(['id', 'status', 'provider', 'provider_reference'])
    .where('id', '=', operation.payment_intent_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const order = await trx.selectFrom('transactions')
    .select(['id', 'status', 'amount', 'currency_code', 'payment_provider', 'payment_reference'])
    .where('id', '=', operation.order_id)
    .forUpdate()
    .executeTakeFirstOrThrow();

  assertRequestState(operation.kind as RequestedPaymentOperationKind, intent.status as PaymentStatus, order.status as TransactionStatus);
  if (
    intent.provider !== 'stripe' ||
    order.payment_provider !== 'stripe' ||
    intent.provider_reference !== order.payment_reference ||
    typeof intent.provider_reference !== 'string'
  ) {
    throw new PaymentOperationError('provider_reference_missing');
  }

  const alreadyRefunded = await refundedAmount(trx, String(intent.id), String(operation.id));
  const remaining = decimal(order.amount) - alreadyRefunded;
  if (remaining <= 0) throw new PaymentOperationError('already_fully_refunded');
  const amount = operation.kind === 'refund_partial' ? decimal(operation.amount) : remaining;
  if (amount <= 0 || amount > remaining) {
    throw new PaymentOperationError('refund_exceeds_remaining');
  }

  await trx.updateTable('payment_operations').set({
    approved_by: approverId,
    status: 'processing',
    amount: amount.toFixed(2),
    decided_at: now,
    updated_at: now
  }).where('id', '=', operation.id).where('status', '=', 'requested').executeTakeFirstOrThrow();

  return {
    operationId: String(operation.id),
    kind: operation.kind as RequestedPaymentOperationKind,
    paymentIntentId: String(intent.provider_reference),
    internalPaymentIntentId: String(intent.id),
    orderId: String(order.id),
    amount: amount.toFixed(2),
    currencyCode: String(order.currency_code).toUpperCase()
  };
}

export async function decidePaymentOperation(input: {
  operationId: string;
  decision: 'approve' | 'reject';
  decidedBy: string;
  decisionReason: string;
  provider: StripePaymentOperationsProvider;
  ipAddress?: string;
}) {
  const decisionReason = input.decisionReason.trim();
  if (decisionReason.length < 8 || decisionReason.length > 2000) {
    throw new PaymentOperationError('invalid_decision_reason', 400);
  }

  let refundWork: RefundWork | null = null;
  const initial = await db.transaction().execute(async (trx) => {
    const operation = await trx.selectFrom('payment_operations').selectAll()
      .where('id', '=', input.operationId).forUpdate().executeTakeFirst();
    if (!operation) throw new PaymentOperationError('operation_not_found', 404);
    if (operation.source !== 'operations' || operation.status !== 'requested') {
      throw new PaymentOperationError('operation_not_reviewable');
    }
    if (operation.requested_by === input.decidedBy) {
      throw new PaymentOperationError('separation_of_duties_required', 403);
    }

    const now = new Date();
    if (input.decision === 'reject') {
      await trx.updateTable('payment_operations').set({
        approved_by: input.decidedBy,
        status: 'rejected',
        error_code: 'rejected_by_reviewer',
        decided_at: now,
        completed_at: now,
        updated_at: now
      }).where('id', '=', operation.id).execute();
    } else if (operationRequiresProviderRefund(operation.kind as any)) {
      refundWork = await prepareRefundApproval(trx, operation, input.decidedBy, now);
    } else {
      await trx.updateTable('payment_operations').set({
        approved_by: input.decidedBy,
        status: 'approved',
        decided_at: now,
        updated_at: now
      }).where('id', '=', operation.id).execute();
      await applyInternalOperation(trx, operation, now);
    }

    await trx.insertInto('audit_logs').values({
      actor_user_id: input.decidedBy,
      action: input.decision === 'approve' ? 'payments.operation.approve' : 'payments.operation.reject',
      entity_type: 'payment_operation',
      entity_id: operation.id,
      ip_address: input.ipAddress ?? null,
      metadata: { kind: operation.kind, decisionReason },
      created_at: now
    }).execute();

    return {
      operationId: String(operation.id),
      status: input.decision === 'reject' ? 'rejected' : refundWork ? 'processing' : 'succeeded'
    };
  });

  const work = refundWork;
  if (!work || input.decision !== 'approve') return initial;

  let result: StripeRefundResult;
  try {
    result = await input.provider.createRefund({
      operationId: work.operationId,
      paymentIntentId: work.paymentIntentId,
      amount: work.amount,
      reason: 'requested_by_customer'
    });
  } catch (error) {
    const code = error instanceof StripeProviderError ? error.safeCode : 'provider_unavailable';
    await db.updateTable('payment_operations').set({
      status: 'failed',
      error_code: code,
      completed_at: new Date(),
      updated_at: new Date()
    }).where('id', '=', work.operationId).where('status', '=', 'processing').execute();
    throw new PaymentOperationError(code, 502);
  }

  if (
    result.paymentIntentId !== work.paymentIntentId ||
    result.amount !== stripeMinorUnits(work.amount) ||
    result.currency !== work.currencyCode
  ) {
    await db.updateTable('payment_operations').set({
      status: 'failed',
      error_code: 'provider_refund_mismatch',
      provider_reference: result.id,
      completed_at: new Date(),
      updated_at: new Date()
    }).where('id', '=', work.operationId).execute();
    throw new PaymentOperationError('provider_refund_mismatch', 502);
  }

  if (result.status === 'failed' || result.status === 'canceled') {
    await db.updateTable('payment_operations').set({
      status: 'failed',
      error_code: `refund_${result.status}`,
      provider_reference: result.id,
      completed_at: new Date(),
      updated_at: new Date()
    }).where('id', '=', work.operationId).execute();
    return { operationId: work.operationId, status: 'failed', providerReference: result.id };
  }

  if (result.status !== 'succeeded') {
    await db.updateTable('payment_operations').set({
      provider_reference: result.id,
      updated_at: new Date()
    }).where('id', '=', work.operationId).execute();
    return { operationId: work.operationId, status: 'processing', providerReference: result.id };
  }

  await finalizeSuccessfulRefund({
    operationId: work.operationId,
    providerReference: result.id,
    providerPaymentIntentId: result.paymentIntentId,
    amountMinor: result.amount,
    currencyCode: result.currency
  });
  return { operationId: work.operationId, status: 'succeeded', providerReference: result.id };
}

export async function finalizeSuccessfulRefund(input: {
  operationId: string;
  providerReference: string;
  providerPaymentIntentId: string;
  amountMinor: number;
  currencyCode: string;
}) {
  return db.transaction().execute(async (trx) => {
    const operation = await trx.selectFrom('payment_operations').selectAll()
      .where('id', '=', input.operationId).forUpdate().executeTakeFirst();
    if (!operation) throw new PaymentOperationError('operation_not_found', 404);
    if (!['processing', 'succeeded'].includes(String(operation.status))) {
      throw new PaymentOperationError('operation_not_processing');
    }
    if (operation.status === 'succeeded') {
      if (operation.provider_reference !== input.providerReference) {
        throw new PaymentOperationError('provider_reference_conflict');
      }
      return { duplicate: true, orderId: String(operation.order_id) };
    }

    const intent = await trx.selectFrom('payment_intents')
      .select(['id', 'status', 'provider_reference'])
      .where('id', '=', operation.payment_intent_id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const order = await trx.selectFrom('transactions')
      .select(['id', 'status', 'amount', 'currency_code'])
      .where('id', '=', operation.order_id)
      .forUpdate()
      .executeTakeFirstOrThrow();

    if (
      intent.provider_reference !== input.providerPaymentIntentId ||
      stripeMinorUnits(operation.amount as string | number) !== input.amountMinor ||
      String(operation.currency_code).toUpperCase() !== input.currencyCode.toUpperCase() ||
      String(order.currency_code).toUpperCase() !== input.currencyCode.toUpperCase()
    ) {
      throw new PaymentOperationError('provider_refund_mismatch');
    }

    const previousRefunded = await refundedAmount(trx, String(intent.id), String(operation.id));
    const totalRefunded = previousRefunded + decimal(operation.amount as string | number);
    const fullyRefunded = totalRefunded >= decimal(order.amount);
    const now = new Date();

    let nextPaymentStatus = intent.status as PaymentStatus;
    let nextOrderStatus = order.status as TransactionStatus;
    if (operation.kind === 'cancel_after_payment') {
      nextPaymentStatus = 'refunded';
      nextOrderStatus = 'cancelled';
    } else if (fullyRefunded || operation.kind === 'refund_full') {
      nextPaymentStatus = 'refunded';
      nextOrderStatus = 'refunded';
    }

    await trx.updateTable('payment_intents')
      .set({ status: nextPaymentStatus, updated_at: now })
      .where('id', '=', intent.id)
      .execute();
    await trx.updateTable('transactions')
      .set({ status: nextOrderStatus, updated_at: now })
      .where('id', '=', order.id)
      .execute();
    await trx.updateTable('payment_operations').set({
      status: 'succeeded',
      provider_reference: input.providerReference,
      completed_at: now,
      updated_at: now
    }).where('id', '=', operation.id).execute();

    return { duplicate: false, orderId: String(order.id), fullyRefunded };
  });
}

export async function recordProviderChargeback(input: {
  providerEventId: string;
  disputeId: string;
  providerPaymentIntentId: string;
  amount: string | number;
  currencyCode: string;
  occurredAt: Date;
}) {
  return db.transaction().execute(async (trx) => {
    const intent = await trx.selectFrom('payment_intents')
      .select(['id', 'transaction_id', 'currency_code', 'provider', 'provider_reference'])
      .where('provider', '=', 'stripe')
      .where('provider_reference', '=', input.providerPaymentIntentId)
      .forUpdate()
      .executeTakeFirst();
    if (!intent?.transaction_id) throw new PaymentOperationError('payment_context_missing');

    const order = await trx.selectFrom('transactions')
      .select(['id'])
      .where('id', '=', intent.transaction_id)
      .forUpdate()
      .executeTakeFirstOrThrow();

    const existing = await trx.selectFrom('payment_operations')
      .select(['id', 'provider_reference'])
      .where('idempotency_key', '=', `stripe-dispute-v1-${input.providerEventId}`)
      .executeTakeFirst();
    if (existing) {
      if (existing.provider_reference !== input.disputeId) {
        throw new PaymentOperationError('provider_event_replay_conflict');
      }
      return { duplicate: true, orderId: String(order.id) };
    }

    if (String(intent.currency_code).toUpperCase() !== input.currencyCode.toUpperCase()) {
      throw new PaymentOperationError('provider_dispute_mismatch');
    }

    const now = new Date();
    const operation = await trx.insertInto('payment_operations').values({
      order_id: order.id,
      payment_intent_id: intent.id,
      kind: 'chargeback',
      source: 'provider',
      status: 'succeeded',
      amount: input.amount,
      currency_code: input.currencyCode.toUpperCase(),
      reason: 'Provider-reported payment dispute or chargeback.',
      requested_by: null,
      approved_by: null,
      provider_reference: input.disputeId,
      idempotency_key: `stripe-dispute-v1-${input.providerEventId}`,
      requested_at: input.occurredAt,
      completed_at: now,
      updated_at: now
    }).returning(['id']).executeTakeFirstOrThrow();

    await trx.updateTable('payment_intents')
      .set({ status: 'disputed', updated_at: now })
      .where('id', '=', intent.id)
      .execute();
    await trx.updateTable('transactions')
      .set({ status: 'disputed', updated_at: now })
      .where('id', '=', order.id)
      .execute();
    await trx.insertInto('audit_logs').values({
      actor_user_id: null,
      action: 'payments.provider.chargeback',
      entity_type: 'payment_operation',
      entity_id: operation.id,
      metadata: {
        provider: 'stripe',
        providerEventId: input.providerEventId,
        disputeId: input.disputeId
      },
      created_at: now
    }).execute();

    return { duplicate: false, orderId: String(order.id) };
  });
}

export async function listPaymentOperations(input: {
  orderId?: string;
  status?: string;
  limit?: number;
}) {
  let query = db.selectFrom('payment_operations')
    .selectAll()
    .orderBy('requested_at', 'desc')
    .limit(input.limit ?? 100);
  if (input.orderId) query = query.where('order_id', '=', input.orderId);
  if (input.status) query = query.where('status', '=', input.status);
  return query.execute();
}
