import { getAuthed, postAuthed } from './authed-api';

export interface OperationsVerificationItem {
  id: string;
  userId: string;
  displayName: string;
  accountStatus: string;
  contact: { email: string | null; phoneE164: string | null };
  profile: { isBusiness: boolean; businessName: string | null };
  level: 'seller' | 'business';
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  provider: string | null;
  providerResult: 'pending' | 'passed' | 'failed' | 'review_required' | 'expired';
  countryCode: string | null;
  reasonCode: string | null;
  reviewNote: string | null;
  subjectSnapshot: Record<string, unknown>;
  submittedAt: string;
  providerCompletedAt: string | null;
  reviewedAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsVerificationPage {
  items: OperationsVerificationItem[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}

export function loadOperationsVerifications(input: {
  status?: 'pending' | 'verified' | 'rejected' | 'expired' | 'all';
  providerResult?: 'pending' | 'passed' | 'failed' | 'review_required' | 'expired';
  limit?: number;
  before?: string;
} = {}): Promise<OperationsVerificationPage> {
  const query = new URLSearchParams();
  if (input.status) query.set('status', input.status);
  if (input.providerResult) query.set('providerResult', input.providerResult);
  if (input.limit) query.set('limit', String(input.limit));
  if (input.before) query.set('before', input.before);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return getAuthed<OperationsVerificationPage>(`/v1/operations/verifications${suffix}`);
}

export function reviewOperationsVerification(input: {
  id: string;
  decision: 'approve' | 'reject';
  reasonCode?: string;
  note?: string;
}): Promise<{ verification: Record<string, unknown> }> {
  return postAuthed(`/v1/operations/verifications/${input.id}/review`, {
    decision: input.decision,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.note ? { note: input.note } : {})
  });
}
