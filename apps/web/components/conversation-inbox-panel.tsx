'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getConversationPage,
  type ConversationSummary
} from '../lib/conversation-api';

export interface ConversationInboxPanelProps {
  locale: string;
  currentUserId: string;
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
    if (caught.status === 429) {
      return isArabic
        ? `محاولات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many requests. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
    }
  }

  return isArabic
    ? 'تعذر تحميل المحادثات حالياً.'
    : 'Conversations could not be loaded right now.';
}

export function ConversationInboxPanel({
  locale,
  currentUserId
}: ConversationInboxPanelProps) {
  const isArabic = locale === 'ar';
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async (cursor?: string) => {
    const append = Boolean(cursor);
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);

    try {
      const response = await getConversationPage({
        limit: 20,
        before: cursor
      });
      setConversations((current) => append
        ? [...current, ...response.conversations]
        : response.conversations
      );
      setHasMore(response.pagination.hasMore);
      setNextCursor(response.pagination.nextCursor);
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
      if (!append) {
        setConversations([]);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [isArabic]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, item) => sum + item.unreadCount, 0),
    [conversations]
  );

  return (
    <section className="conversation-inbox">
      <div className="conversation-toolbar">
        <div>
          <strong>{isArabic ? 'صندوق المحادثات' : 'Conversation inbox'}</strong>
          <span>
            {isArabic
              ? `${conversations.length} محادثة · ${unreadTotal} غير مقروءة`
              : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'} · ${unreadTotal} unread`}
          </span>
        </div>
        <button
          className="button-secondary"
          type="button"
          disabled={loading}
          onClick={() => void loadConversations()}
        >
          {isArabic ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="auth-status" aria-live="polite">
          {isArabic ? 'جارٍ تحميل المحادثات…' : 'Loading conversations…'}
        </p>
      ) : conversations.length === 0 ? (
        <div className="empty-conversations">
          <strong>{isArabic ? 'لا توجد محادثات بعد' : 'No conversations yet'}</strong>
          <p>
            {isArabic
              ? 'ستظهر هنا محادثات المشترين والبائعين عندما تبدأ التواصل.'
              : 'Buyer and seller conversations will appear here after messaging begins.'}
          </p>
          <a className="button-primary" href={`/${locale}`}>
            {isArabic ? 'العودة إلى السوق' : 'Return to marketplace'}
          </a>
        </div>
      ) : (
        <div className="conversation-list">
          {conversations.map((conversation) => {
            const counterpart = conversation.counterpart?.displayName ?? (
              isArabic ? 'مستخدم سوقنا' : 'Suqnaa user'
            );
            const latest = conversation.latestMessage;
            const mine = latest?.senderId === currentUserId;

            return (
              <a
                className={`conversation-card${conversation.unreadCount > 0 ? ' conversation-card-unread' : ''}`}
                href={`/${locale}/messages/${conversation.id}`}
                key={conversation.id}
              >
                <div className="conversation-avatar" aria-hidden="true">
                  {counterpart.slice(0, 1).toUpperCase()}
                </div>
                <div className="conversation-copy">
                  <div className="conversation-card-heading">
                    <strong>{counterpart}</strong>
                    <time dateTime={conversation.updatedAt}>
                      {formatTime(conversation.updatedAt, locale)}
                    </time>
                  </div>
                  <p>
                    {latest
                      ? `${mine ? (isArabic ? 'أنت: ' : 'You: ') : ''}${latest.body}`
                      : (isArabic ? 'ابدأ المحادثة' : 'Start the conversation')}
                  </p>
                  <div className="conversation-card-meta">
                    <span>
                      {conversation.listingId
                        ? (isArabic ? 'مرتبطة بإعلان' : 'Listing conversation')
                        : (isArabic ? 'محادثة مباشرة' : 'Direct conversation')}
                    </span>
                    {conversation.unreadCount > 0 ? (
                      <span className="unread-badge">{conversation.unreadCount}</span>
                    ) : null}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {hasMore && nextCursor ? (
        <button
          className="button-secondary load-more-button"
          type="button"
          disabled={loadingMore}
          onClick={() => void loadConversations(nextCursor)}
        >
          {loadingMore
            ? (isArabic ? 'جارٍ التحميل…' : 'Loading…')
            : (isArabic ? 'تحميل المزيد' : 'Load more')}
        </button>
      ) : null}
    </section>
  );
}
