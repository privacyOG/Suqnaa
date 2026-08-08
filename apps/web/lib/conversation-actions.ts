import { postAuthed, type JsonBody } from './authed-api';
import {
  getConversationSync,
  type ConversationSafetyResponse,
  type MessagePolicy
} from './conversation-api';

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

let activePoll: { conversationId: string; timer: ReturnType<typeof setTimeout> } | null = null;

function conversationPathActive(conversationId: string): boolean {
  if (typeof window === 'undefined') return false;
  const encoded = encodeURIComponent(conversationId);
  return window.location.pathname.includes(`/messages/${encoded}`);
}

function startConversationPolling(conversationId: string): void {
  if (typeof window === 'undefined') return;
  if (activePoll?.conversationId === conversationId) return;
  if (activePoll) clearTimeout(activePoll.timer);

  let cursor: string | undefined;
  let initialized = false;

  const poll = async () => {
    if (!conversationPathActive(conversationId)) {
      activePoll = null;
      return;
    }

    let delay = 3000;
    try {
      if (!document.hidden) {
        const result = await getConversationSync(conversationId, { limit: 100, cursor });
        const nextCursor = result.pagination.cursor ?? cursor;
        const changedAfterInitialization = initialized && result.changes.length > 0;
        const deliveredDuringInitialization = !initialized && result.reconciliation.deliveredMessages > 0;
        cursor = nextCursor;
        initialized = true;
        delay = Math.max(1000, Math.min(10000, result.pagination.pollAfterMs || 3000));

        if (changedAfterInitialization || deliveredDuringInitialization) {
          window.location.reload();
          return;
        }

        if (result.pagination.hasMore) delay = 0;
      }
    } catch {
      delay = 5000;
    }

    const timer = setTimeout(poll, delay);
    activePoll = { conversationId, timer };
  };

  const timer = setTimeout(poll, 0);
  activePoll = { conversationId, timer };
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

export async function acknowledgeConversation(
  conversationId: string
): Promise<ConversationAcknowledgementResponse> {
  const response = await postAuthed<ConversationAcknowledgementResponse>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/read`,
    {}
  );
  startConversationPolling(conversationId);
  return response;
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
