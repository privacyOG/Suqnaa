import { getAuthed, postAuthed } from './authed-api';
import type { DisputeDetail, DisputeSummary, DisputeOutcome } from './dispute-api';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value: string): string { const result = value.trim(); if (!uuidPattern.test(result)) throw new Error('Dispute identifier must be a UUID'); return result; }

export function listOperationsDisputes(): Promise<{ disputes: DisputeSummary[] }> {
  return getAuthed('/v1/operations/disputes?limit=200');
}

export function readOperationsDispute(disputeId: string): Promise<DisputeDetail> {
  return getAuthed(`/v1/operations/disputes/${id(disputeId)}`);
}

export function startDisputeReview(disputeId: string, requestFrom: 'buyer' | 'seller' | null, note?: string) {
  return postAuthed(`/v1/operations/disputes/${id(disputeId)}/review`, { requestFrom, ...(note?.trim() ? { note: note.trim() } : {}) });
}

export function resolveOperationsDispute(disputeId: string, input: {
  outcome: Exclude<DisputeOutcome, 'none'>;
  resolutionNotes: string;
  partialRefundAmount?: string;
}) {
  return postAuthed(`/v1/operations/disputes/${id(disputeId)}/resolve`, {
    outcome: input.outcome,
    resolutionNotes: input.resolutionNotes.trim(),
    ...(input.partialRefundAmount?.trim() ? { partialRefundAmount: input.partialRefundAmount.trim() } : {})
  });
}

export function decideOperationsAppeal(disputeId: string, decision: 'upheld' | 'changed' | 'rejected' | 'escalated', notes: string) {
  return postAuthed(`/v1/operations/disputes/${id(disputeId)}/appeal-decision`, { decision, notes: notes.trim() });
}

export function reconcileOperationsDisputeDeadlines() {
  return postAuthed<{ updated: number }>('/v1/operations/disputes/reconcile-deadlines', { limit: 200 });
}
