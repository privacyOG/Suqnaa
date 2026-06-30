'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  completeOperationsQueueItem,
  getOperationsQueue,
  type OperationsQueueItem,
  type OperationsQueueResult,
  type OperationsQueueStatus
} from '../lib/operations-api';

export interface OperationsQueuePanelProps {
  locale: string;
}

const resultOptions: OperationsQueueResult[] = [
  'no_change',
  'changed_listing',
  'changed_account',
  'other'
];

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

export function OperationsQueuePanel({ locale }: OperationsQueuePanelProps) {
  const isArabic = locale === 'ar';
  const [status, setStatus] = useState<OperationsQueueStatus>('open');
  const [items, setItems] = useState<OperationsQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getOperationsQueue({ status, limit: 25 })
      .then((payload) => {
        if (active) {
          setItems(payload.items);
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

  async function completeItem(itemId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = String(form.get('result') ?? 'no_change') as OperationsQueueResult;
    const note = String(form.get('note') ?? '').trim();

    if (!resultOptions.includes(result)) {
      return;
    }

    setBusyItem(itemId);
    setError(null);
    try {
      await completeOperationsQueueItem(itemId, {
        result,
        note: note || undefined
      });
      setItems((current) => current.filter((item) => item.id !== itemId));
    } catch {
      setError(isArabic ? 'تعذر تحديث العنصر.' : 'Could not update the item.');
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <section className="operations-panel">
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
              <h2>{shortId(item.id)}</h2>
              <p>{item.details || (isArabic ? 'لا توجد تفاصيل إضافية.' : 'No extra details provided.')}</p>
            </div>

            <dl className="listing-facts">
              <div>
                <dt>{isArabic ? 'الحالة' : 'Status'}</dt>
                <dd>{item.status}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'الإعلان' : 'Listing'}</dt>
                <dd>{shortId(item.listingId)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'الحساب' : 'Account'}</dt>
                <dd>{shortId(item.subjectUserId)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'التاريخ' : 'Created'}</dt>
                <dd>{formatDate(item.createdAt, locale)}</dd>
              </div>
            </dl>

            {item.status === 'open' ? (
              <form className="buyer-action-form" onSubmit={(event) => completeItem(item.id, event)}>
                <label>
                  {isArabic ? 'النتيجة' : 'Result'}
                  <select name="result" defaultValue="no_change">
                    {resultOptions.map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {isArabic ? 'ملاحظة' : 'Note'}
                  <textarea name="note" rows={3} maxLength={1200} />
                </label>
                <button className="button-primary" type="submit" disabled={busyItem === item.id}>
                  {busyItem === item.id
                    ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…')
                    : (isArabic ? 'إكمال' : 'Complete')}
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
