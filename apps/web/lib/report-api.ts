import { postAuthed, type JsonBody } from './authed-api';

export type ReportReason =
  | 'prohibited_item'
  | 'scam'
  | 'counterfeit'
  | 'harassment'
  | 'spam'
  | 'wrong_category'
  | 'unsafe'
  | 'other';

export interface SubmitReportInput extends JsonBody {
  listingId?: string;
  reportedUserId?: string;
  messageId?: string;
  reason: ReportReason;
  details?: string;
}

export interface SubmitReportResponse {
  report: {
    id: string;
    status: 'submitted' | 'already_reported';
    listingId?: string | null;
    reportedUserId?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
    reason?: ReportReason;
    createdAt: string;
  };
}

export function submitReport(
  input: SubmitReportInput,
  challengeResponse?: string
): Promise<SubmitReportResponse> {
  return postAuthed<SubmitReportResponse>('/v1/reports', input, challengeResponse);
}
