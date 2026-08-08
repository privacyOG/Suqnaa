import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import type { DisputeCategory, DisputeOutcome, DisputeStatus } from '../db/types.js';
import { readAdministrativePermissions } from '../auth/require-permission.js';
import { requestPaymentOperation } from '../payments/payment-operation-service.js';
import type { RequestedPaymentOperationKind } from '../payments/payment-operation.js';

const participantResponseWindowMs = 5 * 24 * 60 * 60 * 1000;
const operationsReviewWindowMs = 10 * 24 * 60 * 60 * 1000;
const appealWindowMs = 7 * 24 * 60 * 60 * 1000;

export const disputeCategories = [
  'non_delivery',
  'item_condition',
  'damage',
  'pickup_issue',
  'payment_issue',
  'other'
] as const satisfies readonly DisputeCategory[];

export const disputeOutcomes = [
  'buyer_refund',
  'seller_release',
  'partial_refund',
  'return_required',
  'compliance_escalation'
] as const satisfies readonly Exclude<DisputeOutcome, 'none'>[];

const activeStatuses: DisputeStatus[] = [
  'opened',
  'awaiting_buyer',
  'awaiting_seller',
  'under_review'
];

type Executor = any;

export class DisputeWorkflowError extends Error {
  constructor(readonly code: string, readonly statusCode: 400 | 403 | 404 | 409 = 409) {
    super(code);
  }
}

async function appendEvent(executor: Executor, input: {
  disputeId: string;
  actorUserId?: string | null;
  eventType: string;
  details?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  await executor.insertInto('dispute_events').values({
    dispute_id: input.disputeId,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    details: JSON.stringify(input.details ?? {}),
    occurred_at: input.occurredAt ?? new Date(),
    created_at: new Date()
  }).execute();
}

async function participantCase(executor: Executor, disputeId: string, userId: string) {
  const dispute = await executor.selectFrom('disputes').selectAll()
    .where('id', '=', disputeId).executeTakeFirst();
  if (!dispute || (dispute.opened_by_user_id !== userId && dispute.respondent_user_id !== userId)) {
    throw new DisputeWorkflowError('dispute_not_found', 404);
  }
  return dispute;
}

async function readableCase(disputeId: string, userId: string) {
  const dispute = await db.selectFrom('disputes').selectAll()
    .where('id', '=', disputeId).executeTakeFirst();
  if (!dispute) throw new DisputeWorkflowError('dispute_not_found', 404);
  if (dispute.opened_by_user_id === userId || dispute.respondent_user_id === userId) return dispute;
  const permissions = await readAdministrativePermissions(userId);
  if (!permissions.has('disputes.read')) throw new DisputeWorkflowError('dispute_not_found', 404);
  return dispute;
}

function caseSummary(row: Record<string, any>) {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    paymentIntentId: String(row.payment_intent_id),
    openedByUserId: String(row.opened_by_user_id),
    respondentUserId: String(row.respondent_user_id),
    openedByRole: row.opened_by_role,
    category: row.category,
    status: row.status,
    outcome: row.outcome,
    reason: row.reason,
    summary: row.summary,
    responseDueAt: row.response_due_at,
    reviewDueAt: row.review_due_at,
    assignedToUserId: row.assigned_to_user_id,
    resolutionPaymentOperationId: row.resolution_payment_operation_id,
    resolutionNotes: row.resolution_notes,
    appealDeadlineAt: row.appeal_deadline_at,
    escalationLevel: row.escalation_level,
    escalationReason: row.escalation_reason,
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
    version: row.version
  };
}

export async function openOrderDispute(input: {
  orderId: string;
  openedBy: string;
  category: DisputeCategory;
  reason: string;
  summary?: string | null;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const order = await trx.selectFrom('transactions')
      .select(['id', 'buyer_id', 'seller_id', 'status'])
      .where('id', '=', input.orderId)
      .forUpdate()
      .executeTakeFirst();
    if (!order || (order.buyer_id !== input.openedBy && order.seller_id !== input.openedBy)) {
      throw new DisputeWorkflowError('order_not_found', 404);
    }
    if (!['paid', 'released', 'disputed'].includes(String(order.status))) {
      throw new DisputeWorkflowError('order_not_disputable');
    }

    const intent = await trx.selectFrom('payment_intents')
      .select(['id', 'transaction_id'])
      .where('transaction_id', '=', order.id)
      .executeTakeFirst();
    if (!intent) throw new DisputeWorkflowError('payment_context_missing');

    const active = await trx.selectFrom('disputes').select(['id'])
      .where('payment_intent_id', '=', intent.id)
      .where('status', 'in', activeStatuses)
      .executeTakeFirst();
    if (active) throw new DisputeWorkflowError('active_dispute_exists');

    const openedByRole = order.buyer_id === input.openedBy ? 'buyer' : 'seller';
    const respondentUserId = openedByRole === 'buyer' ? order.seller_id : order.buyer_id;
    const status = openedByRole === 'buyer' ? 'awaiting_seller' : 'awaiting_buyer';
    const id = randomUUID();
    const responseDueAt = new Date(now.getTime() + participantResponseWindowMs);
    const reviewDueAt = new Date(now.getTime() + operationsReviewWindowMs);

    const created = await trx.insertInto('disputes').values({
      id,
      payment_intent_id: intent.id,
      order_id: order.id,
      opened_by_user_id: input.openedBy,
      respondent_user_id: respondentUserId,
      opened_by_role: openedByRole,
      category: input.category,
      status,
      outcome: 'none',
      reason: input.reason.trim(),
      summary: input.summary?.trim() || null,
      response_due_at: responseDueAt,
      review_due_at: reviewDueAt,
      opened_at: now,
      last_activity_at: now,
      updated_at: now,
      version: 1
    }).returningAll().executeTakeFirstOrThrow();

    await appendEvent(trx, {
      disputeId: id,
      actorUserId: input.openedBy,
      eventType: 'opened',
      details: { category: input.category, openedByRole },
      occurredAt: now
    });

    return caseSummary(created);
  });
}

export async function listParticipantDisputes(userId: string, limit = 50) {
  const rows = await db.selectFrom('disputes').selectAll()
    .where((eb: any) => eb.or([
      eb('opened_by_user_id', '=', userId),
      eb('respondent_user_id', '=', userId)
    ]))
    .orderBy('last_activity_at', 'desc')
    .limit(Math.min(Math.max(limit, 1), 100))
    .execute();
  return rows.map(caseSummary);
}

export async function readDisputeDetail(disputeId: string, userId: string) {
  const dispute = await readableCase(disputeId, userId);
  const [responses, evidence, appeal, events, operation] = await Promise.all([
    db.selectFrom('dispute_responses').selectAll()
      .where('dispute_id', '=', dispute.id).orderBy('submitted_at', 'asc').execute(),
    db.selectFrom('dispute_evidence')
      .select(['id', 'submitted_by_user_id', 'evidence_type', 'filename', 'mime_type', 'size_bytes', 'note', 'text_value', 'created_at'])
      .where('dispute_id', '=', dispute.id).where('removed_at', 'is', null)
      .orderBy('created_at', 'asc').execute(),
    db.selectFrom('dispute_appeals').selectAll().where('dispute_id', '=', dispute.id).executeTakeFirst(),
    db.selectFrom('dispute_events').select(['id', 'actor_user_id', 'event_type', 'details', 'occurred_at'])
      .where('dispute_id', '=', dispute.id).orderBy('occurred_at', 'asc').orderBy('id', 'asc').execute(),
    dispute.resolution_payment_operation_id
      ? db.selectFrom('payment_operations').select(['id', 'kind', 'status', 'amount', 'currency_code', 'requested_at', 'completed_at'])
        .where('id', '=', dispute.resolution_payment_operation_id).executeTakeFirst()
      : Promise.resolve(undefined)
  ]);

  return {
    dispute: caseSummary(dispute),
    responses: responses.map((row: any) => ({
      id: row.id,
      submittedByUserId: row.submitted_by_user_id,
      responseText: row.response_text,
      submittedAt: row.submitted_at
    })),
    evidence: evidence.map((row: any) => ({
      id: row.id,
      submittedByUserId: row.submitted_by_user_id,
      type: row.evidence_type,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      note: row.note,
      textValue: row.text_value,
      downloadPath: row.mime_type ? `/v1/market/disputes/${dispute.id}/evidence/${row.id}` : null,
      createdAt: row.created_at
    })),
    appeal: appeal ? {
      id: appeal.id,
      openedByUserId: appeal.opened_by_user_id,
      reason: appeal.reason,
      status: appeal.status,
      decisionNotes: appeal.decision_notes,
      openedAt: appeal.opened_at,
      decidedAt: appeal.decided_at
    } : null,
    events: events.map((row: any) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      type: row.event_type,
      details: row.details,
      occurredAt: row.occurred_at
    })),
    paymentOperation: operation ?? null
  };
}

export async function submitDisputeResponse(input: {
  disputeId: string;
  submittedBy: string;
  responseText: string;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const dispute = await participantCase(trx, input.disputeId, input.submittedBy);
    if (!activeStatuses.includes(dispute.status as DisputeStatus)) {
      throw new DisputeWorkflowError('dispute_not_accepting_responses');
    }

    const response = await trx.insertInto('dispute_responses').values({
      dispute_id: dispute.id,
      submitted_by_user_id: input.submittedBy,
      response_text: input.responseText.trim(),
      submitted_at: now
    }).returning(['id', 'submitted_at']).executeTakeFirstOrThrow();

    const respondentAnswered = dispute.respondent_user_id === input.submittedBy;
    const nextStatus = respondentAnswered ? 'under_review' : dispute.status;
    await trx.updateTable('disputes').set({
      status: nextStatus,
      last_activity_at: now,
      updated_at: now,
      version: Number(dispute.version) + 1
    }).where('id', '=', dispute.id).execute();
    await appendEvent(trx, {
      disputeId: dispute.id,
      actorUserId: input.submittedBy,
      eventType: 'response_submitted',
      details: { respondentAnswered },
      occurredAt: now
    });

    return { id: response.id, submittedAt: response.submitted_at, status: nextStatus };
  });
}

export async function submitTextEvidence(input: {
  disputeId: string;
  submittedBy: string;
  evidenceType: string;
  text: string;
  note?: string | null;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const dispute = await participantCase(trx, input.disputeId, input.submittedBy);
    if (dispute.status === 'closed') throw new DisputeWorkflowError('dispute_closed');
    const count = await trx.selectFrom('dispute_evidence')
      .select((eb: any) => eb.fn.countAll<number>().as('count'))
      .where('dispute_id', '=', dispute.id).where('removed_at', 'is', null)
      .executeTakeFirstOrThrow();
    if (Number(count.count) >= 12) throw new DisputeWorkflowError('evidence_limit_reached');
    const evidence = await trx.insertInto('dispute_evidence').values({
      dispute_id: dispute.id,
      submitted_by_user_id: input.submittedBy,
      evidence_type: input.evidenceType,
      object_key: null,
      text_value: input.text.trim(),
      note: input.note?.trim() || null,
      created_at: now
    }).returning(['id', 'created_at']).executeTakeFirstOrThrow();
    await trx.updateTable('disputes').set({ last_activity_at: now, updated_at: now })
      .where('id', '=', dispute.id).execute();
    await appendEvent(trx, {
      disputeId: dispute.id,
      actorUserId: input.submittedBy,
      eventType: 'evidence_added',
      details: { evidenceId: evidence.id, type: input.evidenceType, transport: 'text' },
      occurredAt: now
    });
    return evidence;
  });
}

export async function appealDispute(input: {
  disputeId: string;
  appealedBy: string;
  reason: string;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const dispute = await participantCase(trx, input.disputeId, input.appealedBy);
    if (dispute.status !== 'resolved' || !dispute.appeal_deadline_at || new Date(dispute.appeal_deadline_at) < now) {
      throw new DisputeWorkflowError('appeal_window_closed');
    }
    const existing = await trx.selectFrom('dispute_appeals').select(['id'])
      .where('dispute_id', '=', dispute.id).executeTakeFirst();
    if (existing) throw new DisputeWorkflowError('appeal_already_opened');

    const appeal = await trx.insertInto('dispute_appeals').values({
      dispute_id: dispute.id,
      opened_by_user_id: input.appealedBy,
      reason: input.reason.trim(),
      status: 'pending',
      opened_at: now,
      updated_at: now
    }).returning(['id', 'status', 'opened_at']).executeTakeFirstOrThrow();
    await trx.updateTable('disputes').set({
      status: 'under_review',
      escalation_level: Math.min(Number(dispute.escalation_level) + 1, 3),
      escalation_reason: 'Participant appeal submitted within the permitted review window.',
      assigned_to_user_id: null,
      last_activity_at: now,
      updated_at: now,
      version: Number(dispute.version) + 1
    }).where('id', '=', dispute.id).execute();
    await appendEvent(trx, {
      disputeId: dispute.id,
      actorUserId: input.appealedBy,
      eventType: 'appealed',
      details: { appealId: appeal.id },
      occurredAt: now
    });
    return appeal;
  });
}

export async function listOperationsDisputes(input: {
  status?: DisputeStatus;
  overdue?: boolean;
  limit?: number;
}) {
  let query = db.selectFrom('disputes').selectAll();
  if (input.status) query = query.where('status', '=', input.status);
  if (input.overdue) {
    query = query.where((eb: any) => eb.or([
      eb('response_due_at', '<', new Date()),
      eb('review_due_at', '<', new Date())
    ]));
  }
  const rows = await query.orderBy('last_activity_at', 'asc')
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 200)).execute();
  return rows.map(caseSummary);
}

export async function beginOperationsReview(input: {
  disputeId: string;
  reviewerId: string;
  requestFrom?: 'buyer' | 'seller' | null;
  note?: string | null;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const dispute = await trx.selectFrom('disputes').selectAll()
      .where('id', '=', input.disputeId).forUpdate().executeTakeFirst();
    if (!dispute) throw new DisputeWorkflowError('dispute_not_found', 404);
    if (['resolved', 'closed'].includes(dispute.status)) throw new DisputeWorkflowError('dispute_not_reviewable');

    const status = input.requestFrom === 'buyer'
      ? 'awaiting_buyer'
      : input.requestFrom === 'seller'
        ? 'awaiting_seller'
        : 'under_review';
    const responseDueAt = input.requestFrom
      ? new Date(now.getTime() + participantResponseWindowMs)
      : dispute.response_due_at;

    await trx.updateTable('disputes').set({
      status,
      assigned_to_user_id: input.reviewerId,
      response_due_at: responseDueAt,
      review_due_at: new Date(now.getTime() + operationsReviewWindowMs),
      last_activity_at: now,
      updated_at: now,
      version: Number(dispute.version) + 1
    }).where('id', '=', dispute.id).execute();
    await appendEvent(trx, {
      disputeId: dispute.id,
      actorUserId: input.reviewerId,
      eventType: input.requestFrom ? 'more_information_requested' : 'review_started',
      details: { requestFrom: input.requestFrom ?? null, note: input.note?.trim() || null },
      occurredAt: now
    });
    return { status, responseDueAt, assignedToUserId: input.reviewerId };
  });
}

function paymentKindForOutcome(outcome: Exclude<DisputeOutcome, 'none'>): RequestedPaymentOperationKind | null {
  switch (outcome) {
    case 'buyer_refund': return 'refund_full';
    case 'seller_release': return 'release';
    case 'partial_refund': return 'refund_partial';
    case 'compliance_escalation': return 'compliance_hold';
    case 'return_required': return null;
  }
}

async function findResolutionOperation(disputeId: string, orderId: string, kind: RequestedPaymentOperationKind) {
  return db.selectFrom('payment_operations')
    .select(['id', 'kind', 'status'])
    .where('order_id', '=', orderId)
    .where('kind', '=', kind)
    .where('reason', 'like', `[dispute:${disputeId}]%`)
    .where('status', 'in', ['requested', 'approved', 'processing', 'succeeded'])
    .orderBy('requested_at', 'desc')
    .executeTakeFirst();
}

export async function resolveDispute(input: {
  disputeId: string;
  reviewerId: string;
  outcome: Exclude<DisputeOutcome, 'none'>;
  resolutionNotes: string;
  partialRefundAmount?: string | number | null;
  hasPaymentRequestPermission: boolean;
  ipAddress?: string;
}) {
  const existing = await db.selectFrom('disputes').selectAll().where('id', '=', input.disputeId).executeTakeFirst();
  if (!existing) throw new DisputeWorkflowError('dispute_not_found', 404);
  if (existing.status === 'closed') throw new DisputeWorkflowError('dispute_closed');
  if (existing.status === 'resolved' && existing.outcome === input.outcome) {
    return { dispute: caseSummary(existing), paymentOperationId: existing.resolution_payment_operation_id };
  }

  const paymentKind = paymentKindForOutcome(input.outcome);
  let paymentOperationId: string | null = null;
  if (paymentKind) {
    if (!input.hasPaymentRequestPermission) throw new DisputeWorkflowError('payments_request_permission_required', 403);
    const existingOperation = await findResolutionOperation(existing.id, existing.order_id, paymentKind);
    if (existingOperation) {
      paymentOperationId = String(existingOperation.id);
    } else {
      const requested = await requestPaymentOperation({
        orderId: String(existing.order_id),
        kind: paymentKind,
        amount: paymentKind === 'refund_partial' ? input.partialRefundAmount : null,
        reason: `[dispute:${existing.id}] ${input.resolutionNotes.trim()}`,
        requestedBy: input.reviewerId,
        ipAddress: input.ipAddress
      });
      paymentOperationId = String(requested.id);
    }
  }

  const now = new Date();
  const updated = await db.transaction().execute(async (trx) => {
    const dispute = await trx.selectFrom('disputes').selectAll()
      .where('id', '=', input.disputeId).forUpdate().executeTakeFirstOrThrow();
    if (dispute.status === 'closed') throw new DisputeWorkflowError('dispute_closed');
    await trx.updateTable('disputes').set({
      status: 'resolved',
      outcome: input.outcome,
      resolution_notes: input.resolutionNotes.trim(),
      resolved_by_user_id: input.reviewerId,
      resolution_payment_operation_id: paymentOperationId,
      resolved_at: now,
      appeal_deadline_at: new Date(now.getTime() + appealWindowMs),
      last_activity_at: now,
      updated_at: now,
      version: Number(dispute.version) + 1
    }).where('id', '=', dispute.id).execute();
    await appendEvent(trx, {
      disputeId: dispute.id,
      actorUserId: input.reviewerId,
      eventType: 'resolved',
      details: { outcome: input.outcome, paymentOperationId },
      occurredAt: now
    });
    return trx.selectFrom('disputes').selectAll().where('id', '=', dispute.id).executeTakeFirstOrThrow();
  });

  return { dispute: caseSummary(updated), paymentOperationId };
}

export async function decideDisputeAppeal(input: {
  disputeId: string;
  reviewerId: string;
  decision: 'upheld' | 'changed' | 'rejected' | 'escalated';
  notes: string;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const dispute = await trx.selectFrom('disputes').selectAll()
      .where('id', '=', input.disputeId).forUpdate().executeTakeFirst();
    if (!dispute) throw new DisputeWorkflowError('dispute_not_found', 404);
    const appeal = await trx.selectFrom('dispute_appeals').selectAll()
      .where('dispute_id', '=', dispute.id).forUpdate().executeTakeFirst();
    if (!appeal || !['pending', 'under_review', 'escalated'].includes(String(appeal.status))) {
      throw new DisputeWorkflowError('appeal_not_reviewable');
    }
    if (appeal.opened_by_user_id === input.reviewerId) {
      throw new DisputeWorkflowError('appeal_reviewer_conflict', 403);
    }

    const finalStatus = input.decision === 'escalated' ? 'under_review' : 'resolved';
    await trx.updateTable('dispute_appeals').set({
      status: input.decision,
      decided_by_user_id: input.reviewerId,
      decision_notes: input.notes.trim(),
      decided_at: now,
      updated_at: now
    }).where('id', '=', appeal.id).execute();
    await trx.updateTable('disputes').set({
      status: finalStatus,
      assigned_to_user_id: input.decision === 'escalated' ? null : input.reviewerId,
      escalation_level: input.decision === 'escalated'
        ? Math.min(Number(dispute.escalation_level) + 1, 3)
        : dispute.escalation_level,
      escalation_reason: input.decision === 'escalated' ? input.notes.trim() : dispute.escalation_reason,
      last_activity_at: now,
      updated_at: now,
      version: Number(dispute.version) + 1
    }).where('id', '=', dispute.id).execute();
    await appendEvent(trx, {
      disputeId: dispute.id,
      actorUserId: input.reviewerId,
      eventType: input.decision === 'escalated' ? 'escalated' : 'appeal_decided',
      details: { decision: input.decision },
      occurredAt: now
    });
    return { status: finalStatus, appealStatus: input.decision };
  });
}

export async function reconcileDisputeDeadlines(limit = 100) {
  const now = new Date();
  const candidates = await db.selectFrom('disputes').selectAll()
    .where('status', 'in', ['awaiting_buyer', 'awaiting_seller'])
    .where('response_due_at', '<', now)
    .orderBy('response_due_at', 'asc')
    .limit(Math.min(Math.max(limit, 1), 500))
    .execute();
  let updated = 0;
  for (const candidate of candidates) {
    await db.transaction().execute(async (trx) => {
      const dispute = await trx.selectFrom('disputes').selectAll()
        .where('id', '=', candidate.id).forUpdate().executeTakeFirst();
      if (!dispute || !['awaiting_buyer', 'awaiting_seller'].includes(dispute.status) || new Date(dispute.response_due_at) >= now) return;
      await trx.updateTable('disputes').set({
        status: 'under_review',
        escalation_level: Math.min(Number(dispute.escalation_level) + 1, 3),
        escalation_reason: 'Participant response deadline elapsed without a timely response.',
        review_due_at: new Date(now.getTime() + operationsReviewWindowMs),
        last_activity_at: now,
        updated_at: now,
        version: Number(dispute.version) + 1
      }).where('id', '=', dispute.id).execute();
      await appendEvent(trx, {
        disputeId: dispute.id,
        eventType: 'response_overdue',
        details: { previousStatus: dispute.status },
        occurredAt: now
      });
      updated += 1;
    });
  }
  return updated;
}
