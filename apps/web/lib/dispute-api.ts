import { getAuthed, postAuthed, postAuthedBinary } from './authed-api';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DisputeCategory = 'non_delivery' | 'item_condition' | 'damage' | 'pickup_issue' | 'payment_issue' | 'other';
export type DisputeStatus = 'opened' | 'awaiting_buyer' | 'awaiting_seller' | 'under_review' | 'resolved' | 'closed';
export type DisputeOutcome = 'none' | 'buyer_refund' | 'seller_release' | 'partial_refund' | 'return_required' | 'compliance_escalation';

export interface DisputeSummary {
  id: string;
  orderId: string;
  paymentIntentId: string;
  openedByUserId: string;
  respondentUserId: string;
  openedByRole: 'buyer' | 'seller';
  category: DisputeCategory;
  status: DisputeStatus;
  outcome: DisputeOutcome;
  reason: string;
  summary: string | null;
  responseDueAt: string;
  reviewDueAt: string;
  resolutionPaymentOperationId: string | null;
  resolutionNotes: string | null;
  appealDeadlineAt: string | null;
  escalationLevel: number;
  escalationReason: string | null;
  openedAt: string;
  resolvedAt: string | null;
  lastActivityAt: string;
}

export interface DisputeDetail {
  dispute: DisputeSummary;
  responses: Array<{ id: string; submittedByUserId: string; responseText: string; submittedAt: string }>;
  evidence: Array<{
    id: string;
    submittedByUserId: string;
    type: string;
    filename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    note: string | null;
    textValue: string | null;
    downloadPath: string | null;
    createdAt: string;
  }>;
  appeal: null | {
    id: string;
    openedByUserId: string;
    reason: string;
    status: string;
    decisionNotes: string | null;
    openedAt: string;
    decidedAt: string | null;
  };
  events: Array<{ id: string; actorUserId: string | null; type: string; details: Record<string, unknown>; occurredAt: string }>;
  paymentOperation: null | { id: string; kind: string; status: string; amount: string | number | null; currency_code: string; requested_at: string; completed_at: string | null };
}

function id(value: string, label: string): string {
  const normalized = value.trim();
  if (!uuidPattern.test(normalized)) throw new Error(`${label} must be a UUID`);
  return normalized;
}

export function listDisputes(): Promise<{ disputes: DisputeSummary[] }> {
  return getAuthed('/v1/market/disputes?limit=100');
}

export function readDispute(disputeId: string): Promise<DisputeDetail> {
  return getAuthed(`/v1/market/disputes/${id(disputeId, 'Dispute identifier')}`);
}

export function openDispute(input: {
  orderId: string;
  category: DisputeCategory;
  reason: string;
  summary?: string;
}): Promise<{ dispute: DisputeSummary }> {
  return postAuthed('/v1/market/disputes', {
    orderId: id(input.orderId, 'Order identifier'),
    category: input.category,
    reason: input.reason.trim(),
    ...(input.summary?.trim() ? { summary: input.summary.trim() } : {})
  });
}

export function respondToDispute(disputeId: string, responseText: string) {
  return postAuthed(`/v1/market/disputes/${id(disputeId, 'Dispute identifier')}/responses`, { responseText: responseText.trim() });
}

export function addTextDisputeEvidence(disputeId: string, input: { evidenceType: string; text: string; note?: string }) {
  return postAuthed(`/v1/market/disputes/${id(disputeId, 'Dispute identifier')}/evidence/text`, {
    evidenceType: input.evidenceType.trim(),
    text: input.text.trim(),
    ...(input.note?.trim() ? { note: input.note.trim() } : {})
  });
}

export function uploadDisputeEvidence(disputeId: string, input: { evidenceType: string; file: File; note?: string }) {
  const query = new URLSearchParams({ evidenceType: input.evidenceType.trim(), filename: input.file.name });
  if (input.note?.trim()) query.set('note', input.note.trim());
  return postAuthedBinary(
    `/v1/market/disputes/${id(disputeId, 'Dispute identifier')}/evidence/upload?${query.toString()}`,
    input.file
  );
}

export function appealDispute(disputeId: string, reason: string) {
  return postAuthed(`/v1/market/disputes/${id(disputeId, 'Dispute identifier')}/appeal`, { reason: reason.trim() });
}

export function protectedEvidenceHref(downloadPath: string): string {
  if (!downloadPath.startsWith('/v1/market/disputes/')) throw new Error('Invalid private evidence path');
  return `/api/authed${downloadPath}`;
}
