import { postAuthed, type JsonBody } from './authed-api';
import type { ConversationSafetyResponse, MessagePolicy } from './conversation-api';

export interface ConversationEntryInput extends JsonBody {
  recipientId: string;
  listingId?: string;
  body: string;
  clientMessageId?: string;
  attachments?: unknown[];
}

export interface ConversationEntryResponse {
  accepted: boolean;
  idempotent: boolean;
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    recipientId: string;
    listingId: string | null;
    clientMessageId: string | null;
    status: string;
    createdAt: string;
    attachments: unknown[];
  };
  policy?: MessagePolicy;
}

export interface ConversationAcknowledgementResponse {
  conversationId: string;
  updatedMessages: number;
  readAt: string;
}

export function createConversationEntry(
  input: ConversationEntryInput,
  challengeResponse?: string
): Promise<ConversationEntryResponse> {
  return postAuthed<ConversationEntryResponse>(
    '/v1/messages',
    input,
    challengeResponse
  );
}

export function acknowledgeConversation(
  conversationId: string
): Promise<ConversationAcknowledgementResponse> {
  return postAuthed<ConversationAcknowledgementResponse>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/read`,
    {}
  );
}

export function setConversationMuted(
  conversationId: string,
  muted: boolean
): Promise<ConversationSafetyResponse> {
  return postAuthed<ConversationSafetyResponse>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/mute`,
    { muted }
  );
}

export function setConversationBlocked(
  conversationId: string,
  blocked: boolean
): Promise<ConversationSafetyResponse> {
  return postAuthed<ConversationSafetyResponse>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/block`,
    { blocked }
  );
}
