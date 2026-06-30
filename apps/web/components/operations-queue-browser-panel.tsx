'use client';

import { useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getOperationsQueue,
  type OperationsQueueItem,
  type OperationsQueueStatus
} from '../lib/operations-api';

export interface OperationsQueueBrowserPanelProps {
  locale: string;
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function shortId(value: string | null): string {
  return value ? value.slice(0, 8) : '—';
}

function displayName(name: string | null, id: string | null): string {
  return name?.trim() || shortId(id);
}

function itemTitle(item: OperationsQueueItem): string {
  return item.listingTitle?.trim()
    || item.subjectUserName?.trim()
    || shortId(item.listingId ?? item.subjectUserId ?? item.id);
}

function statusLabel(value: string | null): string {
  return value?.trim() || '—';
}

function appendUnique(
  current: OperationsQueueItem[],
  incoming: OperationsQueueItem[]
): OperationsQueueItem[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

export function OperationsQueueBrowserPanel({ locale }: OperationsQueueBrowserPanelProps) {
  const isArabic = locale === 'ar';
  const [status, setStatus] = useState<OperationsQueueStatus>('open');
  const [items, setItems] = useState<OperationsQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setNextCursor(null);

    getOperationsQueue({ status, limit: 25 })
      .then((payload) => {
        if (active) {
          setItems(payload.items);
          setNextCursor(payload.pagination.nextCursor);
        }
      })
      .catch((caught) => {
        if (!active) {
          return;
        }
        if (caught instanceof AuthedRequestError && caught.status === 403) {
          setError(isArabic ? 'غير مصرح لهذا الحساب.' : 'This account is not allowed.');
        } else if (caught instanceof AuthedRequestError && caught.status === 401) {
          setError(isArabic ? 'سجّل الدخول ثم أعد المحاولة.' : 'Sign in and try again.');
        } else {
          setError(isArabic ? 'تعذر تحميل القائمة.' : 'Could not load the queue.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [status, isArabic]);

  async function loadMore() {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setError(null);
    try {
      const payload = await getOperationsQueue({ status, limit: 25, before: nextCursor });
      setItems((current) => appendUnique(current, payload.items));
      setNextCursor(payload.pagination.nextCursor);
    } catch {
      setError(isArabic ? 'تعذر تحميل المزيد.' : 'Could not load more items.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="operations-panel">
      <div className="catalog-header">
        <div>
          <span className="buyer-action-label">{isArabic ? 'تصفح' : 'Browse'}</span>
          <h2>{isArabic ? 'تصفح قائمة العمليات' : 'Queue browser'}</h2>
          <p>
            {isArabic
              ? 'عرض قابل للتحميل لصفحات إضافية من القائمة.'
              : 'Read-only paginated view for loading additional queue pages.'}
          </p>
        </div>
      </div>

      <div className="actions">
        <button className={status === 'open' ? 'button-primary' : 'button-secondary'} type="button" onClick={() => setStatus('open')}>
          {isArabic ? 'مفتوحة' : 'Open'}
        </button>
        <button className={status === 'closed' ? 'button-primary' : 'button-secondary'} type="button" onClick={() => setStatus('closed')}>
          {isArabic ? 'مغلقة' : 'Closed'}
        </button>
        <button className={status === 'all' ? 'button-primary' : 'button-secondary'} type="button" onClick={() => setStatus('all')}>
          {isArabic ? 'الكل' : 'All'}
        </button>
      </div>

      {loading ? <p>{isArabic ? 'جارٍ التحميل…' : 'Loading…'}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="empty-catalog">
          <strong>{isArabic ? 'لا توجد عناصر' : 'No items'}</strong>
          <p>{isArabic ? 'لا توجد عناصر في هذا العرض.' : 'There are no items in this view.'}</p>
        </div>
      ) : null}

      <div className="operations-list">
        {items.map((item) => (
          <article className="buyer-action-card" key={item.id}>
            <div>
              <span className="buyer-action-label">{item.reason}</span>
              <h3>{itemTitle(item)}</h3>
              <p>{item.details || (isArabic ? 'لا توجد تفاصيل إضافية.' : 'No extra details provided.')}</p>
            </div>

            <dl className="listing-facts">
              <div>
                <dt>{isArabic ? 'الحالة' : 'Status'}</dt>
                <dd>{item.status}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'الإعلان' : 'Listing'}</dt>
                <dd>{item.listingTitle || shortId(item.listingId)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'حالة الإعلان' : 'Listing status'}</dt>
                <dd>{statusLabel(item.listingStatus)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'الحساب' : 'Account'}</dt>
                <dd>{displayName(item.subjectUserName, item.subjectUserId)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'حالة الحساب' : 'Account status'}</dt>
                <dd>{statusLabel(item.subjectUserStatus)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'المبلّغ' : 'Reporter'}</dt>
                <dd>{displayName(item.reporterName, item.reporterId)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'حالة المبلّغ' : 'Reporter status'}</dt>
                <dd>{statusLabel(item.reporterStatus)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'التاريخ' : 'Created'}</dt>
                <dd>{formatDate(item.createdAt, locale)}</dd>
              </div>
              {item.reviewAction ? (
                <div>
                  <dt>{isArabic ? 'النتيجة' : 'Result'}</dt>
                  <dd>{item.reviewAction}</dd>
                </div>
              ) : null}
              {item.resolvedAt ? (
                <div>
                  <dt>{isArabic ? 'تاريخ الإغلاق' : 'Closed at'}</dt>
                  <dd>{formatDate(item.resolvedAt, locale)}</dd>
                </div>
              ) : null}
              {item.reviewNote ? (
                <div>
                  <dt>{isArabic ? 'ملاحظة' : 'Note'}</dt>
                  <dd>{item.reviewNote}</dd>
                </div>
              ) : null}
            </dl>
          </article>
        ))}
      </div>

      {nextCursor ? (
        <div className="actions">
          <button className="button-secondary" type="button" disabled={loadingMore} onClick={loadMore}>
            {loadingMore
              ? (isArabic ? 'جارٍ التحميل…' : 'Loading…')
              : (isArabic ? 'تحميل المزيد' : 'Load more')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
