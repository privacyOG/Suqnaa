import { getAuthed } from './authed-api';

export interface CursorPageOptions {
  limit?: number;
  before?: string;
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
  } | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
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
}

export interface ConversationHistoryResponse {
  conversation: {
    id: string;
    listingId: string | null;
    buyerId: string;
    sellerId: string;
  };
  messages: ConversationMessage[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
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
