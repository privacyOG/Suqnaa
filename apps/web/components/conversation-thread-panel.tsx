'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getConversationHistory,
  getConversationPage,
  type ConversationHistoryResponse,
  type ConversationMessage
} from '../lib/conversation-api';
import {
  acknowledgeConversation,
  createConversationEntry
} from '../lib/conversation-actions';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export interface ConversationThreadPanelProps {
  locale: string;
  currentUserId: string;
  conversationId: string;
}

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function failureMessage(caught: unknown, isArabic: boolean): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic
        ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.'
        : 'Your account session ended. Sign in again.';
    }
    if (caught.status === 404) {
      return isArabic
        ? 'المحادثة غير موجودة أو لا يمكنك الوصول إليها.'
        : 'The conversation was not found or is not available to you.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `محاولات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many requests. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
    }
    if (caught.payload.requiresHumanCheck) {
      return isArabic
        ? 'أكمل الفحص الأمني مرة أخرى.'
        : 'Complete the security check again.';
    }
    if (caught.status === 400) {
      return isArabic
        ? 'تعذر إرسال الرسالة. تحقق من النص ثم أعد المحاولة.'
        : 'The message could not be sent. Check the text and try again.';
    }
  }

  return isArabic
    ? 'تعذر إكمال الطلب حالياً.'
    : 'The request could not be completed right now.';
}

function createdMessageFromResponse(
  value: Record<string, unknown>,
  body: string,
  currentUserId: string,
  conversationId: string,
  clientMessageId: string
): ConversationMessage {
  const createdAt = typeof value.createdAt === 'string'
    ? value.createdAt
    : new Date().toISOString();

  return {
    id: typeof value.id === 'string' ? value.id : clientMessageId,
    conversationId: typeof value.conversationId === 'string'
      ? value.conversationId
      : conversationId,
    senderId: typeof value.senderId === 'string'
      ? value.senderId
      : currentUserId,
    body,
    clientMessageId: typeof value.clientMessageId === 'string'
      ? value.clientMessageId
      : clientMessageId,
    status: typeof value.status === 'string' ? value.status : 'queued',
    createdAt,
    updatedAt: createdAt,
    readAt: null
  };
}

export function ConversationThreadPanel({
  locale,
  currentUserId,
  conversationId
}: ConversationThreadPanelProps) {
  const isArabic = locale === 'ar';
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const [conversation, setConversation] = useState<ConversationHistoryResponse['conversation'] | null>(null);
  const [counterpartName, setCounterpartName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeAction = configuration?.actions.messageCreate;
  const challengeReady = !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);

  useEffect(() => {
    let active = true;

    getChallengeConfiguration()
      .then((value) => {
        if (active) {
          setConfiguration(value);
        }
      })
      .catch(() => {
        if (active) {
          setConfigurationError(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const loadHistory = useCallback(async (cursor?: string) => {
    const append = Boolean(cursor);
    append ? setLoadingOlder(true) : setLoading(true);
    setError(null);

    try {
      const [history, inbox] = await Promise.all([
        getConversationHistory(conversationId, {
          limit: 50,
          before: cursor
        }),
        append
          ? Promise.resolve(null)
          : getConversationPage({ limit: 50 }).catch(() => null)
      ]);

      setConversation(history.conversation);
      setMessages((current) => append
        ? [...current, ...history.messages]
        : history.messages
      );
      setHasMore(history.pagination.hasMore);
      setNextCursor(history.pagination.nextCursor);

      if (inbox) {
        const summary = inbox.conversations.find((item) => item.id === conversationId);
        setCounterpartName(summary?.counterpart?.displayName ?? null);
      }

      if (!append) {
        void acknowledgeConversation(conversationId).catch(() => undefined);
      }
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
      if (!append) {
        setConversation(null);
        setMessages([]);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      append ? setLoadingOlder(false) : setLoading(false);
    }
  }, [conversationId, isArabic]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      listEndRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [loading, messages.length]);

  const recipientId = useMemo(() => {
    if (!conversation) {
      return null;
    }
    if (conversation.buyerId === currentUserId) {
      return conversation.sellerId;
    }
    if (conversation.sellerId === currentUserId) {
      return conversation.buyerId;
    }
    return null;
  }, [conversation, currentUserId]);

  const chronologicalMessages = useMemo(
    () => [...messages].reverse(),
    [messages]
  );

  const counterpartLabel = counterpartName ?? (
    recipientId
      ? `${isArabic ? 'عضو' : 'Member'} ${recipientId.slice(0, 8)}`
      : (isArabic ? 'محادثة' : 'Conversation')
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!recipientId || !challengeReady || sending || configurationError || configuration === null) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get('body') ?? '').trim();
    if (!body || body.length > 2000) {
      setError(
        isArabic
          ? 'اكتب رسالة بين حرف واحد و2000 حرف.'
          : 'Enter a message between 1 and 2,000 characters.'
      );
      return;
    }

    const clientMessageId = globalThis.crypto.randomUUID();
    setSending(true);
    setError(null);

    try {
      const response = await createConversationEntry(
        {
          recipientId,
          listingId: conversation?.listingId ?? undefined,
          body,
          clientMessageId
        },
        challengeToken ?? undefined
      );
      const messageRecord = response.message as Record<string, unknown>;
      const created = createdMessageFromResponse(
        messageRecord,
        body,
        currentUserId,
        conversationId,
        clientMessageId
      );
      setMessages((current) => [created, ...current]);
      formElement.reset();
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setSending(false);
    }
  }

  return (
    <section className="conversation-thread">
      <header className="conversation-thread-header">
        <a href={`/${locale}/messages`} aria-label={isArabic ? 'العودة إلى المحادثات' : 'Back to conversations'}>
          {isArabic ? '← المحادثات' : '← Conversations'}
        </a>
        <div>
          <strong>{counterpartLabel}</strong>
          <span>
            {conversation?.listingId
              ? (isArabic ? 'محادثة مرتبطة بإعلان' : 'Listing conversation')
              : (isArabic ? 'محادثة مباشرة' : 'Direct conversation')}
          </span>
        </div>
        <button
          className="button-secondary"
          type="button"
          disabled={loading}
          onClick={() => void loadHistory()}
        >
          {isArabic ? 'تحديث' : 'Refresh'}
        </button>
      </header>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="auth-status" aria-live="polite">
          {isArabic ? 'جارٍ تحميل الرسائل…' : 'Loading messages…'}
        </p>
      ) : !conversation ? (
        <div className="empty-conversations">
          <strong>{isArabic ? 'تعذر فتح المحادثة' : 'Conversation unavailable'}</strong>
          <a className="button-primary" href={`/${locale}/messages`}>
            {isArabic ? 'العودة إلى الصندوق' : 'Return to inbox'}
          </a>
        </div>
      ) : (
        <>
          {hasMore && nextCursor ? (
            <button
              className="button-secondary older-messages-button"
              type="button"
              disabled={loadingOlder}
              onClick={() => void loadHistory(nextCursor)}
            >
              {loadingOlder
                ? (isArabic ? 'جارٍ التحميل…' : 'Loading…')
                : (isArabic ? 'تحميل رسائل أقدم' : 'Load older messages')}
            </button>
          ) : null}

          <div className="message-list" aria-live="polite">
            {chronologicalMessages.length === 0 ? (
              <div className="empty-message-thread">
                {isArabic ? 'ابدأ المحادثة برسالة.' : 'Start the conversation with a message.'}
              </div>
            ) : chronologicalMessages.map((message) => {
              const mine = message.senderId === currentUserId;
              return (
                <article
                  className={`message-bubble${mine ? ' message-bubble-mine' : ''}`}
                  key={message.id}
                >
                  <p>{message.body}</p>
                  <footer>
                    <time dateTime={message.createdAt}>{formatTime(message.createdAt, locale)}</time>
                    {mine ? <span>{message.status}</span> : null}
                  </footer>
                </article>
              );
            })}
            <div ref={listEndRef} />
          </div>

          <form className="message-composer" onSubmit={handleSubmit}>
            <label>
              <span className="sr-only">{isArabic ? 'الرسالة' : 'Message'}</span>
              <textarea
                name="body"
                rows={3}
                minLength={1}
                maxLength={2000}
                required
                placeholder={isArabic ? 'اكتب رسالتك…' : 'Write your message…'}
              />
            </label>

            {challengeEnabled && siteKey && challengeAction ? (
              <div className="message-security-check">
                <ChallengeProviderScript />
                <ChallengeWidget
                  siteKey={siteKey}
                  action={challengeAction}
                  locale={locale}
                  resetKey={resetKey}
                  onToken={setChallengeToken}
                  onExpired={() => setChallengeToken(null)}
                  onError={() => {
                    setChallengeToken(null);
                    setError(
                      isArabic
                        ? 'تعذر إكمال الفحص الأمني.'
                        : 'The security check could not be completed.'
                    );
                  }}
                />
              </div>
            ) : null}

            {configurationError ? (
              <p className="auth-error" role="alert">
                {isArabic
                  ? 'تعذر تحميل إعدادات الأمان. الإرسال متوقف مؤقتاً.'
                  : 'Security settings could not be loaded. Sending is temporarily unavailable.'}
              </p>
            ) : null}

            {!configuration ? (
              <p className="auth-status">
                {isArabic ? 'جارٍ تحميل إعدادات الأمان…' : 'Loading security settings…'}
              </p>
            ) : null}

            <button
              className="button-primary"
              type="submit"
              disabled={!recipientId || !challengeReady || sending || configurationError || configuration === null}
            >
              {sending
                ? (isArabic ? 'جارٍ الإرسال…' : 'Sending…')
                : (isArabic ? 'إرسال' : 'Send')}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
