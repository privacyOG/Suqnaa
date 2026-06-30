import { getAuthed, postAuthed, type JsonBody } from './authed-api';

export type OperationsQueueStatus = 'open' | 'closed' | 'all';
export type OperationsQueueResult = 'no_change' | 'changed_listing' | 'changed_account' | 'other';
export type OperationsListingStatus = 'draft' | 'active' | 'reserved' | 'sold' | 'expired' | 'removed';
export type OperationsAccountStatus = 'active' | 'suspended';

export interface OperationsQueueItem {
  id: string;
  status: 'open' | 'closed';
  reporterId: string;
  reporterName: string | null;
  reporterStatus: string | null;
  listingId: string | null;
  listingTitle: string | null;
  listingStatus: string | null;
  subjectUserId: string | null;
  subjectUserName: string | null;
  subjectUserStatus: string | null;
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

export interface SetOperationsListingStatusInput extends JsonBody {
  status: OperationsListingStatus;
  note?: string;
}

export interface SetOperationsAccountStatusInput extends JsonBody {
  status: OperationsAccountStatus;
  note?: string;
}

export interface OperationsStatusActionResponse extends CompleteOperationsQueueResponse {
  listing?: {
    id: string;
    status: OperationsListingStatus;
  };
  account?: {
    id: string;
    status: OperationsAccountStatus;
  };
}

export interface OperationRecordItem {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface OperationRecordsResponse {
  items: OperationRecordItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface OperationRecordsOptions {
  limit?: number;
  before?: string;
  action?: string;
  entityType?: string;
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

export function getOperationRecords(
  options: OperationRecordsOptions = {}
): Promise<OperationRecordsResponse> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) {
    query.set('limit', String(options.limit));
  }
  if (options.before) {
    query.set('before', options.before);
  }
  if (options.action) {
    query.set('action', options.action);
  }
  if (options.entityType) {
    query.set('entityType', options.entityType);
  }

  const encoded = query.toString();
  return getAuthed<OperationRecordsResponse>(
    encoded ? `/v1/operations/records?${encoded}` : '/v1/operations/records'
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

export function setOperationsListingStatus(
  itemId: string,
  input: SetOperationsListingStatusInput
): Promise<OperationsStatusActionResponse> {
  return postAuthed<OperationsStatusActionResponse>(
    `/v1/operations/queue/${itemId}/listing-status`,
    input
  );
}

export function setOperationsAccountStatus(
  itemId: string,
  input: SetOperationsAccountStatusInput
): Promise<OperationsStatusActionResponse> {
  return postAuthed<OperationsStatusActionResponse>(
    `/v1/operations/queue/${itemId}/account-status`,
    input
  );
}
