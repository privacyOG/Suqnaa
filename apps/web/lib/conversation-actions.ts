import { postAuthed, type JsonBody } from './authed-api';

export interface ConversationEntryInput extends JsonBody {
  recipientId: string;
  listingId?: string;
  body: string;
  clientMessageId?: string;
}

export interface ConversationEntryResponse {
  message: Record<string, unknown>;
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
): Promise<Record<string, unknown>> {
  return postAuthed(
    `/v1/conversations/${encodeURIComponent(conversationId)}/read`,
    {}
  );
}
