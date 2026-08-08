import { db } from '../db/index.js';
import type { DisputeOutcome } from '../db/types.js';
import { requestPaymentOperation } from '../payments/payment-operation-service.js';
import {
  protectionPolicyVersion,
  returnShipmentWindowDays,
  type ProtectionEligibility
} from './protection-policy.js';

const activeReturnStatuses = ['authorized', 'awaiting_shipment', 'in_transit', 'delivered', 'received', 'contested'] as const;

type Executor = any;

export class ProtectionWorkflowError extends Error {
  constructor(readonly code: string, readonly statusCode: 400 | 403 | 404 | 409 = 409) {
    super(code);
  }
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

async function appendProtectionEvent(executor: Executor, input: {
  protectionCaseId: string;
  returnId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  details?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  await executor.insertInto('protection_events').values({
    protection_case_id: input.protectionCaseId,
    return_id: input.returnId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    details: JSON.stringify(input.details ?? {}),
    occurred_at: input.occurredAt ?? new Date(),
    created_at: new Date()
  }).execute();
}

function eventForOutcome(outcome: Exclude<DisputeOutcome, 'none'>): string {
  switch (outcome) {
    case 'buyer_refund':
    case 'partial_refund':
      return 'refund_requested';
    case 'seller_release':
      return 'release_requested';
    case 'return_required':
      return 'return_authorized';
    case 'compliance_escalation':
      return 'protection_escalated';
  }
}

export async function materializeProtectionResolution(input: {
  disputeId: string;
  reviewerId: string;
  outcome: Exclude<DisputeOutcome, 'none'>;
  resolutionNotes: string;
  eligibility: ProtectionEligibility;
}) {
  if (!input.eligibility.claimType) return { protectionCaseId: null, returnId: null };

  return db.transaction().execute(async (trx) => {
    const dispute = await trx.selectFrom('disputes').selectAll()
      .where('id', '=', input.disputeId).forUpdate().executeTakeFirst();
    if (!dispute) throw new ProtectionWorkflowError('dispute_not_found', 404);
    if (dispute.status !== 'resolved' || dispute.outcome !== input.outcome) {
      throw new ProtectionWorkflowError('resolved_dispute_required');
    }

    let protectionCase = await trx.selectFrom('order_protection_cases').selectAll()
      .where('dispute_id', '=', dispute.id).executeTakeFirst();
    if (!protectionCase) {
      const beneficiaryRole = input.eligibility.beneficiaryRole
        ?? (input.outcome === 'seller_release' ? 'seller' : 'buyer');
      protectionCase = await trx.insertInto('order_protection_cases').values({
        dispute_id: dispute.id,
        order_id: dispute.order_id,
        payment_intent_id: dispute.payment_intent_id,
        claimant_user_id: dispute.opened_by_user_id,
        respondent_user_id: dispute.respondent_user_id,
        beneficiary_role: beneficiaryRole,
        claim_type: input.eligibility.claimType,
        policy_version: protectionPolicyVersion,
        eligibility_basis: JSON.stringify({
          eligible: input.eligibility.eligible,
          reasonCode: input.eligibility.reasonCode,
          ...input.eligibility.basis
        }),
        created_at: new Date(),
        updated_at: new Date()
      }).returningAll().executeTakeFirstOrThrow();

      await appendProtectionEvent(trx, {
        protectionCaseId: protectionCase.id,
        actorUserId: dispute.opened_by_user_id,
        eventType: 'claim_opened',
        details: {
          claimType: input.eligibility.claimType,
          beneficiaryRole,
          policyVersion: protectionPolicyVersion,
          eligibilityReason: input.eligibility.reasonCode
        }
      });
    }

    let returnRow = await trx.selectFrom('order_returns').selectAll()
      .where('protection_case_id', '=', protectionCase.id).executeTakeFirst();
    if (input.outcome === 'return_required' && !returnRow) {
      const order = await trx.selectFrom('transactions')
        .select(['buyer_id', 'seller_id']).where('id', '=', dispute.order_id).executeTakeFirstOrThrow();
      const now = new Date();
      returnRow = await trx.insertInto('order_returns').values({
        protection_case_id: protectionCase.id,
        dispute_id: dispute.id,
        order_id: dispute.order_id,
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
        status: 'authorized',
        reason: input.resolutionNotes.trim(),
        authorized_by_user_id: input.reviewerId,
        return_due_at: addDays(now, returnShipmentWindowDays),
        created_at: now,
        updated_at: now,
        version: 1
      }).returningAll().executeTakeFirstOrThrow();
    }

    const eventType = eventForOutcome(input.outcome);
    const alreadyRecorded = await trx.selectFrom('protection_events').select(['id'])
      .where('protection_case_id', '=', protectionCase.id)
      .where('event_type', '=', eventType)
      .executeTakeFirst();
    if (!alreadyRecorded) {
      await appendProtectionEvent(trx, {
        protectionCaseId: protectionCase.id,
        returnId: returnRow?.id ?? null,
        actorUserId: input.reviewerId,
        eventType,
        details: { outcome: input.outcome }
      });
    }

    return { protectionCaseId: String(protectionCase.id), returnId: returnRow ? String(returnRow.id) : null };
  });
}

export async function readOrderProtection(input: { orderId: string; requestedBy: string }) {
  const order = await db.selectFrom('transactions').select(['id', 'buyer_id', 'seller_id'])
    .where('id', '=', input.orderId).executeTakeFirst();
  if (!order || (order.buyer_id !== input.requestedBy && order.seller_id !== input.requestedBy)) {
    throw new ProtectionWorkflowError('order_not_found', 404);
  }
  const cases = await db.selectFrom('order_protection_cases').selectAll()
    .where('order_id', '=', order.id).orderBy('created_at', 'desc').execute();
  const returns = await db.selectFrom('order_returns').selectAll()
    .where('order_id', '=', order.id).orderBy('created_at', 'desc').execute();
  return { cases, returns };
}

export async function shipReturn(input: {
  returnId: string;
  buyerId: string;
  carrier: string;
  trackingReference: string;
  trackingUrl?: string | null;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const row = await trx.selectFrom('order_returns').selectAll()
      .where('id', '=', input.returnId).forUpdate().executeTakeFirst();
    if (!row || row.buyer_id !== input.buyerId) throw new ProtectionWorkflowError('return_not_found', 404);
    if (!['authorized', 'awaiting_shipment'].includes(String(row.status))) {
      if (row.status === 'in_transit' && row.tracking_reference === input.trackingReference.trim()) return row;
      throw new ProtectionWorkflowError('return_not_shippable');
    }
    if (new Date(row.return_due_at) < now) throw new ProtectionWorkflowError('return_shipment_window_expired');

    const updated = await trx.updateTable('order_returns').set({
      status: 'in_transit',
      carrier: input.carrier.trim(),
      tracking_reference: input.trackingReference.trim(),
      tracking_url: input.trackingUrl?.trim() || null,
      shipped_at: now,
      updated_at: now,
      version: Number(row.version) + 1
    }).where('id', '=', row.id).returningAll().executeTakeFirstOrThrow();
    await appendProtectionEvent(trx, {
      protectionCaseId: row.protection_case_id,
      returnId: row.id,
      actorUserId: input.buyerId,
      eventType: 'return_shipped',
      details: { carrier: input.carrier.trim(), trackingReference: input.trackingReference.trim() },
      occurredAt: now
    });
    return updated;
  });
}

export async function acknowledgeReturnedItem(input: {
  returnId: string;
  sellerId: string;
  condition: 'accepted' | 'contested';
  note?: string | null;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const row = await trx.selectFrom('order_returns').selectAll()
      .where('id', '=', input.returnId).forUpdate().executeTakeFirst();
    if (!row || row.seller_id !== input.sellerId) throw new ProtectionWorkflowError('return_not_found', 404);
    if (!['in_transit', 'delivered', 'received', 'contested'].includes(String(row.status))) {
      throw new ProtectionWorkflowError('return_not_receivable');
    }
    if (input.condition === 'contested' && (!input.note || input.note.trim().length < 8)) {
      throw new ProtectionWorkflowError('contest_note_required', 400);
    }

    const status = input.condition === 'accepted' ? 'received' : 'contested';
    const updated = await trx.updateTable('order_returns').set({
      status,
      delivered_at: row.delivered_at ?? now,
      received_at: row.received_at ?? now,
      received_by_user_id: input.sellerId,
      seller_condition: input.condition,
      seller_condition_note: input.note?.trim() || null,
      seller_response_due_at: null,
      updated_at: now,
      version: Number(row.version) + 1
    }).where('id', '=', row.id).returningAll().executeTakeFirstOrThrow();
    await appendProtectionEvent(trx, {
      protectionCaseId: row.protection_case_id,
      returnId: row.id,
      actorUserId: input.sellerId,
      eventType: input.condition === 'accepted' ? 'return_received' : 'return_contested',
      details: { condition: input.condition },
      occurredAt: now
    });
    return updated;
  });
}

export async function completeReturnProtection(input: {
  returnId: string;
  reviewerId: string;
  decision: 'refund_buyer' | 'release_seller';
  reason: string;
  hasPaymentRequestPermission: boolean;
  ipAddress?: string;
}) {
  if (!input.hasPaymentRequestPermission) throw new ProtectionWorkflowError('payments_request_permission_required', 403);
  const row = await db.selectFrom('order_returns').selectAll().where('id', '=', input.returnId).executeTakeFirst();
  if (!row) throw new ProtectionWorkflowError('return_not_found', 404);
  if (!['received', 'contested', 'expired'].includes(String(row.status))) {
    throw new ProtectionWorkflowError('return_not_ready_for_resolution');
  }
  if (input.decision === 'refund_buyer' && row.status === 'expired') {
    throw new ProtectionWorkflowError('expired_unshipped_return_cannot_refund');
  }

  const kind = input.decision === 'refund_buyer' ? 'refund_full' : 'release';
  const existing = await db.selectFrom('payment_operations').select(['id', 'status'])
    .where('order_id', '=', row.order_id)
    .where('kind', '=', kind)
    .where('reason', 'like', `[return:${row.id}]%`)
    .where('status', 'in', ['requested', 'approved', 'processing', 'succeeded'])
    .orderBy('requested_at', 'desc').executeTakeFirst();
  const operation = existing ?? await requestPaymentOperation({
    orderId: String(row.order_id),
    kind,
    reason: `[return:${row.id}] ${input.reason.trim()}`,
    requestedBy: input.reviewerId,
    ipAddress: input.ipAddress
  });

  const now = new Date();
  await db.transaction().execute(async (trx) => {
    const current = await trx.selectFrom('order_returns').selectAll()
      .where('id', '=', row.id).forUpdate().executeTakeFirstOrThrow();
    if (current.status === 'completed') return;
    await trx.updateTable('order_returns').set({
      status: 'completed',
      completed_at: now,
      updated_at: now,
      version: Number(current.version) + 1
    }).where('id', '=', current.id).execute();
    await appendProtectionEvent(trx, {
      protectionCaseId: current.protection_case_id,
      returnId: current.id,
      actorUserId: input.reviewerId,
      eventType: input.decision === 'refund_buyer' ? 'refund_requested' : 'release_requested',
      details: { paymentOperationId: operation.id, decision: input.decision },
      occurredAt: now
    });
    await appendProtectionEvent(trx, {
      protectionCaseId: current.protection_case_id,
      returnId: current.id,
      actorUserId: input.reviewerId,
      eventType: 'return_completed',
      details: { paymentOperationId: operation.id, decision: input.decision },
      occurredAt: now
    });
  });

  return { paymentOperationId: String(operation.id), decision: input.decision };
}

export async function reconcileReturnDeadlines(limit = 100) {
  const now = new Date();
  const rows = await db.selectFrom('order_returns').selectAll()
    .where('status', 'in', ['authorized', 'awaiting_shipment'])
    .where('return_due_at', '<', now)
    .orderBy('return_due_at', 'asc')
    .limit(Math.min(Math.max(limit, 1), 500)).execute();
  let updated = 0;
  for (const candidate of rows) {
    await db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom('order_returns').selectAll()
        .where('id', '=', candidate.id).forUpdate().executeTakeFirst();
      if (!row || !['authorized', 'awaiting_shipment'].includes(String(row.status)) || new Date(row.return_due_at) >= now) return;
      await trx.updateTable('order_returns').set({
        status: 'expired', updated_at: now, version: Number(row.version) + 1
      }).where('id', '=', row.id).execute();
      await appendProtectionEvent(trx, {
        protectionCaseId: row.protection_case_id,
        returnId: row.id,
        eventType: 'return_expired',
        details: { returnDueAt: row.return_due_at },
        occurredAt: now
      });
      updated += 1;
    });
  }
  return updated;
}

export function isActiveReturnStatus(status: string): boolean {
  return activeReturnStatuses.includes(status as (typeof activeReturnStatuses)[number]);
}
