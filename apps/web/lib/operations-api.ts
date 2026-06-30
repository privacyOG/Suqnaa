import { getAuthed, postAuthed, type JsonBody } from './authed-api';

export type OperationsQueueStatus = 'open' | 'closed' | 'all';
export type OperationsQueueResult = 'no_change' | 'changed_listing' | 'changed_account' | 'other';

export interface OperationsQueueItem {
  id: string;
  status: 'open' | 'closed';
  reporterId: string;
  listingId: string | null;
  subjectUserId: string | null;
  reason: string;
  details: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reviewAction: string | null;
  reviewNote: string | null;
}

export interface OperationsQueueResponse {
  items: OperationsQueueItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface OperationsQueueOptions {
  status?: OperationsQueueStatus;
  limit?: number;
  before?: string;
}

export interface CompleteOperationsQueueInput extends JsonBody {
  result: OperationsQueueResult;
  note?: string;
}

export interface CompleteOperationsQueueResponse {
  item: {
    id: string;
    status: 'closed';
    resolvedAt: string;
    reviewAction: OperationsQueueResult;
  };
}

export function getOperationsQueue(
  options: OperationsQueueOptions = {}
): Promise<OperationsQueueResponse> {
  const query = new URLSearchParams();
  if (options.status) {
    query.set('status', options.status);
  }
  if (options.limit !== undefined) {
    query.set('limit', String(options.limit));
  }
  if (options.before) {
    query.set('before', options.before);
  }

  const encoded = query.toString();
  return getAuthed<OperationsQueueResponse>(
    encoded ? `/v1/operations/queue?${encoded}` : '/v1/operations/queue'
  );
}

export function completeOperationsQueueItem(
  itemId: string,
  input: CompleteOperationsQueueInput
): Promise<CompleteOperationsQueueResponse> {
  return postAuthed<CompleteOperationsQueueResponse>(
    `/v1/operations/queue/${itemId}/complete`,
    input
  );
}
