import { getAuthed } from './authed-api';

export interface CursorPageOptions {
  limit?: number;
  before?: string;
}

export interface ConversationSyncOptions {
  limit?: number;
  cursor?: string;
}

export interface ConversationSafetyState {
  muted: boolean;
  blockedByMe: boolean;
  messagingAvailable: boolean;
}

export interface MessagePolicy {
  maxBodyCharacters: number;
  maxHttpUrls: number;
  attachments: {
    enabled: boolean;
    maxCount: number;
    reason: string;
  };
}

export interface ConversationSummary {
  id: string;
  listingId: string | null;
  counterpart: {
    id: string;
    displayName: string;
    status: string;
  } | null;
  latestMessage: {
    id: string;
    senderId: string;
    body: string;
    status: string;
    createdAt: string;
    attachments: unknown[];
  } | null;
  unreadCount: number;
  safety: ConversationSafetyState;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
  policy: MessagePolicy;
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientMessageId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  attachments: unknown[];
}

export interface ConversationHistoryResponse {
  conversation: {
    id: string;
    listingId: string | null;
    buyerId: string;
    sellerId: string;
    safety: ConversationSafetyState;
  };
  policy: MessagePolicy;
  messages: ConversationMessage[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface ConversationSyncResponse {
  conversationId: string;
  changes: ConversationMessage[];
  reconciliation: {
    deliveredMessages: number;
    serverTime: string;
  };
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    pollAfterMs: number;
  };
}

export interface ConversationSafetyResponse {
  safety: ConversationSafetyState & {
    conversationId: string;
    counterpartId: string;
  };
  policy: MessagePolicy;
}

function pagedPath(path: string, options: CursorPageOptions = {}) {
  const query = new URLSearchParams();

  if (options.limit !== undefined) {
    query.set('limit', String(options.limit));
  }
  if (options.before) {
    query.set('before', options.before);
  }

  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function getConversationPage(
  options: CursorPageOptions = {}
): Promise<ConversationListResponse> {
  return getAuthed<ConversationListResponse>(
    pagedPath('/v1/conversations', options)
  );
}

export function getConversationHistory(
  conversationId: string,
  options: CursorPageOptions = {}
): Promise<ConversationHistoryResponse> {
  return getAuthed<ConversationHistoryResponse>(
    pagedPath(
      `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      options
    )
  );
}

export function getConversationSync(
  conversationId: string,
  options: ConversationSyncOptions = {}
): Promise<ConversationSyncResponse> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  if (options.cursor) query.set('cursor', options.cursor);
  const encoded = query.toString();
  const path = `/v1/conversations/${encodeURIComponent(conversationId)}/sync`;
  return getAuthed<ConversationSyncResponse>(encoded ? `${path}?${encoded}` : path);
}

export function getConversationSafety(
  conversationId: string
): Promise<ConversationSafetyResponse> {
  return getAuthed<ConversationSafetyResponse>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/safety`
  );
}
