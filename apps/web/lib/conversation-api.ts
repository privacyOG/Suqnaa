import { getAuthed } from './authed-api';

export interface CursorPageOptions {
  limit?: number;
  before?: string;
}

export interface ConversationListResponse {
  conversations: Array<{
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
  }>;
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface ConversationHistoryResponse {
  conversation: {
    id: string;
    listingId: string | null;
    buyerId: string;
    sellerId: string;
  };
  messages: Array<{
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    clientMessageId: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    readAt: string | null;
  }>;
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
  accessToken: string,
  options: CursorPageOptions = {}
): Promise<ConversationListResponse> {
  return getAuthed(pagedPath('/v1/conversations', options), accessToken);
}

export function getConversationHistory(
  accessToken: string,
  conversationId: string,
  options: CursorPageOptions = {}
): Promise<ConversationHistoryResponse> {
  return getAuthed(
    pagedPath(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, options),
    accessToken
  );
}
