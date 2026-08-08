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
  createConversationEntry,
  setConversationBlocked,
  setConversationMuted
} from '../lib/conversation-actions';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { submitReport, type ReportReason } from '../lib/report-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export interface ConversationThreadPanelProps {
  locale: string;
  currentUserId: string;
  conversationId: string;
}

const messageReportReasons: ReportReason[] = ['harassment', 'spam', 'scam', 'unsafe', 'other'];
const reportLabels: Record<ReportReason, [string, string]> = {
  prohibited_item: ['Prohibited content', 'محتوى محظور'],
  scam: ['Scam or suspicious request', 'احتيال أو طلب مريب'],
  counterfeit: ['Misleading claim', 'ادعاء مضلل'],
  harassment: ['Harassment or abuse', 'مضايقة أو إساءة'],
  spam: ['Spam or repeated content', 'رسائل مزعجة أو محتوى متكرر'],
  wrong_category: ['Misleading context', 'سياق مضلل'],
  unsafe: ['Unsafe request or threat', 'طلب غير آمن أو تهديد'],
  other: ['Other safety concern', 'مشكلة أمان أخرى']
};

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
    if (caught.status === 409) {
      return isArabic
        ? 'المراسلة غير متاحة لهذه المحادثة حالياً.'
        : 'Messaging is unavailable for this conversation.';
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
        ? 'تعذر إكمال الطلب. تحقق من المدخلات ثم أعد المحاولة.'
        : 'The request could not be completed. Check the input and try again.';
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
    readAt: null,
    attachments: []
  };
}

export function ConversationThreadPanel({
  locale,
  currentUserId,
  conversationId
}: ConversationThreadPanelProps) {
  const isArabic = locale === 'ar';
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollRef = useRef(true);
  const [conversation, setConversation] = useState<ConversationHistoryResponse['conversation'] | null>(null);
  const [policy, setPolicy] = useState<ConversationHistoryResponse['policy'] | null>(null);
  const [counterpartName, setCounterpartName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [reportToken, setReportToken] = useState<string | null>(null);
  const [reportResetKey, setReportResetKey] = useState(0);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeAction = configuration?.actions.messageCreate;
  const reportAction = configuration?.actions.reportCreate;
  const challengeReady = !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);
  const reportReady = !challengeEnabled || Boolean(siteKey && reportAction && reportToken);

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
    shouldScrollRef.current = !append;
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
      setPolicy(history.policy);
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
        setPolicy(null);
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
    if (!loading && messages.length > 0 && shouldScrollRef.current) {
      listEndRef.current?.scrollIntoView({ block: 'end' });
      shouldScrollRef.current = false;
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

    if (
      !recipientId ||
      !conversation?.safety.messagingAvailable ||
      !challengeReady ||
      sending ||
      configurationError ||
      configuration === null
    ) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get('body') ?? '').trim();
    const maxBody = policy?.maxBodyCharacters ?? 2000;
    if (!body || body.length > maxBody) {
      setError(
        isArabic
          ? `اكتب رسالة بين حرف واحد و${maxBody} حرف.`
          : `Enter a message between 1 and ${maxBody.toLocaleString()} characters.`
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
          clientMessageId,
          attachments: []
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
      shouldScrollRef.current = true;
      setMessages((current) => [created, ...current]);
      formElement.reset();
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
      if (caught instanceof AuthedRequestError && caught.status === 409) {
        void loadHistory();
      }
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setSending(false);
    }
  }

  async function toggleMute() {
    if (!conversation || safetyBusy) return;
    setSafetyBusy(true);
    setError(null);
    try {
      const response = await setConversationMuted(conversation.id, !conversation.safety.muted);
      setConversation((current) => current ? { ...current, safety: response.safety } : current);
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
    } finally {
      setSafetyBusy(false);
    }
  }

  async function toggleBlock() {
    if (!conversation || safetyBusy) return;
    if (!conversation.safety.blockedByMe) {
      const confirmed = globalThis.confirm(
        isArabic
          ? 'سيؤدي الحظر إلى إيقاف الرسائل الجديدة بينكما وكتم محادثات هذا المستخدم. هل تريد المتابعة؟'
          : 'Blocking stops new messages in both directions and mutes your conversations with this user. Continue?'
      );
      if (!confirmed) return;
    }

    setSafetyBusy(true);
    setError(null);
    try {
      const response = await setConversationBlocked(conversation.id, !conversation.safety.blockedByMe);
      setConversation((current) => current ? { ...current, safety: response.safety } : current);
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
    } finally {
      setSafetyBusy(false);
    }
  }

  async function submitMessageReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportMessageId || !configuration || configurationError || !reportReady || reportSubmitting) {
      return;
    }
    if (reportDetails.length > 1200) {
      setReportStatus(isArabic ? 'اجعل التفاصيل أقل من 1200 حرف.' : 'Keep details under 1,200 characters.');
      return;
    }

    setReportSubmitting(true);
    setReportStatus(null);
    try {
      const response = await submitReport({
        messageId: reportMessageId,
        reason: reportReason,
        details: reportDetails.trim() || undefined
      }, reportToken ?? undefined);
      setReportStatus(
        response.report.status === 'already_reported'
          ? (isArabic ? 'هذا البلاغ مسجل بالفعل وينتظر المراجعة.' : 'This message already has your unresolved report.')
          : (isArabic ? 'تم إرسال بلاغ الرسالة للمراجعة.' : 'Message report submitted for review.')
      );
      setReportDetails('');
    } catch (caught) {
      setReportStatus(failureMessage(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setReportToken(null);
        setReportResetKey((value) => value + 1);
      }
      setReportSubmitting(false);
    }
  }

  return (
    <section className="conversation-thread">
      {challengeEnabled ? <ChallengeProviderScript /> : null}
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
        <div>
          {conversation ? (
            <>
              <button className="button-secondary" type="button" disabled={safetyBusy} onClick={() => void toggleMute()}>
                {conversation.safety.muted
                  ? (isArabic ? 'إلغاء الكتم' : 'Unmute')
                  : (isArabic ? 'كتم' : 'Mute')}
              </button>{' '}
              <button className="button-secondary" type="button" disabled={safetyBusy} onClick={() => void toggleBlock()}>
                {conversation.safety.blockedByMe
                  ? (isArabic ? 'إلغاء الحظر' : 'Unblock')
                  : (isArabic ? 'حظر' : 'Block')}
              </button>{' '}
            </>
          ) : null}
          <button
            className="button-secondary"
            type="button"
            disabled={loading}
            onClick={() => void loadHistory()}
          >
            {isArabic ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      </header>

      {conversation?.safety.muted ? (
        <p className="auth-status">
          {isArabic
            ? 'هذه المحادثة مكتومة. سيستمر ظهور الرسائل هنا، لكن إعداد الكتم محفوظ للإشعارات.'
            : 'This conversation is muted. Messages remain visible here; the mute preference is retained for notifications.'}
        </p>
      ) : null}
      {conversation && !conversation.safety.messagingAvailable ? (
        <p className="auth-status">
          {isArabic
            ? 'المراسلة الجديدة متوقفة لهذه العلاقة. يظل سجل المحادثة متاحاً لك.'
            : 'New messaging is unavailable for this participant pair. Your conversation history remains available.'}
        </p>
      ) : null}
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
                    {mine ? <span>{message.status}</span> : (
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => {
                          setReportMessageId(message.id);
                          setReportStatus(null);
                        }}
                      >
                        {isArabic ? 'الإبلاغ عن الرسالة' : 'Report message'}
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
            <div ref={listEndRef} />
          </div>

          {reportMessageId ? (
            <form className="buyer-action-form" onSubmit={submitMessageReport}>
              <strong>{isArabic ? 'الإبلاغ عن هذه الرسالة' : 'Report this message'}</strong>
              <label>
                {isArabic ? 'السبب' : 'Reason'}
                <select value={reportReason} onChange={(event) => setReportReason(event.target.value as ReportReason)}>
                  {messageReportReasons.map((reason) => (
                    <option key={reason} value={reason}>{reportLabels[reason][isArabic ? 1 : 0]}</option>
                  ))}
                </select>
              </label>
              <label>
                {isArabic ? 'تفاصيل اختيارية' : 'Optional details'}
                <textarea
                  rows={3}
                  maxLength={1200}
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value)}
                  placeholder={isArabic
                    ? 'أضف سياقاً مفيداً بدون كلمات مرور أو رموز تحقق.'
                    : 'Add useful context without passwords or verification codes.'}
                />
              </label>
              {challengeEnabled && siteKey && reportAction ? (
                <ChallengeWidget
                  siteKey={siteKey}
                  action={reportAction}
                  locale={locale}
                  resetKey={reportResetKey}
                  onToken={setReportToken}
                  onExpired={() => setReportToken(null)}
                  onError={() => setReportToken(null)}
                />
              ) : null}
              {reportStatus ? <p className="auth-status" role="status">{reportStatus}</p> : null}
              <div>
                <button className="button-secondary" type="button" onClick={() => setReportMessageId(null)}>
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>{' '}
                <button className="button-primary" type="submit" disabled={!reportReady || reportSubmitting || configurationError}>
                  {reportSubmitting
                    ? (isArabic ? 'جارٍ الإرسال…' : 'Submitting…')
                    : (isArabic ? 'إرسال البلاغ' : 'Submit report')}
                </button>
              </div>
            </form>
          ) : null}

          {conversation.safety.messagingAvailable ? (
            <form className="message-composer" onSubmit={handleSubmit}>
              <label>
                <span className="sr-only">{isArabic ? 'الرسالة' : 'Message'}</span>
                <textarea
                  name="body"
                  rows={3}
                  minLength={1}
                  maxLength={policy?.maxBodyCharacters ?? 2000}
                  required
                  placeholder={isArabic ? 'اكتب رسالتك…' : 'Write your message…'}
                />
              </label>

              {policy?.attachments.enabled === false ? (
                <p className="auth-status">
                  {isArabic
                    ? 'المرفقات متوقفة حالياً حتى تتوفر فحوصات أمان الملفات.'
                    : 'Attachments are disabled until hardened file-safety checks are available.'}
                </p>
              ) : null}

              {challengeEnabled && siteKey && challengeAction ? (
                <div className="message-security-check">
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
          ) : null}
        </>
      )}
    </section>
  );
}
