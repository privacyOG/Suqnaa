import { postAuthed, type JsonBody } from './authed-api';

export interface ConversationEntryInput extends JsonBody {
  recipientId: string;
  listingId?: string;
  body: string;
  clientMessageId?: string;
}

export function createConversationEntry(
  accessToken: string,
  input: ConversationEntryInput
) {
  return postAuthed('/v1/messages', accessToken, input);
}

export function acknowledgeConversation(
  accessToken: string,
  conversationId: string
) {
  return postAuthed(
    `/v1/conversations/${encodeURIComponent(conversationId)}/read`,
    accessToken,
    {}
  );
}
