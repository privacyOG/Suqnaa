'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  completeOperationsQueueItem,
  getOperationsQueue,
  setOperationsAccountStatus,
  setOperationsListingStatus,
  type OperationsAccountStatus,
  type OperationsListingStatus,
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

const listingStatusOptions: OperationsListingStatus[] = [
  'draft',
  'active',
  'reserved',
  'sold',
  'expired',
  'removed'
];

const accountStatusOptions: OperationsAccountStatus[] = [
  'active',
  'suspended'
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

function displayName(name: string | null, id: string | null): string {
  return name?.trim() || shortId(id);
}

function itemHeading(item: OperationsQueueItem): string {
  return item.listingTitle?.trim()
    || item.subjectUserName?.trim()
    || shortId(item.listingId ?? item.subjectUserId ?? item.id);
}

function statusLabel(value: string | null): string {
  return value?.trim() || '—';
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

  function closeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

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
      closeItem(itemId);
    } catch {
      setError(isArabic ? 'تعذر تحديث العنصر.' : 'Could not update the item.');
    } finally {
      setBusyItem(null);
    }
  }

  async function applyListingStatus(itemId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get('listingStatus') ?? '') as OperationsListingStatus;
    const note = String(form.get('listingNote') ?? '').trim();

    if (!listingStatusOptions.includes(nextStatus)) {
      return;
    }

    setBusyItem(itemId);
    setError(null);
    try {
      await setOperationsListingStatus(itemId, {
        status: nextStatus,
        note: note || undefined
      });
      closeItem(itemId);
    } catch {
      setError(isArabic ? 'تعذر تحديث حالة الإعلان.' : 'Could not update listing status.');
    } finally {
      setBusyItem(null);
    }
  }

  async function applyAccountStatus(itemId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get('accountStatus') ?? '') as OperationsAccountStatus;
    const note = String(form.get('accountNote') ?? '').trim();

    if (!accountStatusOptions.includes(nextStatus)) {
      return;
    }

    setBusyItem(itemId);
    setError(null);
    try {
      await setOperationsAccountStatus(itemId, {
        status: nextStatus,
        note: note || undefined
      });
      closeItem(itemId);
    } catch {
      setError(isArabic ? 'تعذر تحديث حالة الحساب.' : 'Could not update account status.');
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
              <h2>{itemHeading(item)}</h2>
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
            </dl>

            {item.status === 'open' ? (
              <div className="operations-list">
                {item.listingId ? (
                  <form className="buyer-action-form" onSubmit={(event) => applyListingStatus(item.id, event)}>
                    <label>
                      {isArabic ? 'تغيير حالة الإعلان' : 'Set listing status'}
                      <select name="listingStatus" defaultValue={item.listingStatus ?? 'removed'}>
                        {listingStatusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {isArabic ? 'ملاحظة' : 'Note'}
                      <textarea name="listingNote" rows={2} maxLength={1200} />
                    </label>
                    <button className="button-primary" type="submit" disabled={busyItem === item.id}>
                      {isArabic ? 'حفظ حالة الإعلان' : 'Save listing status'}
                    </button>
                  </form>
                ) : null}

                {item.subjectUserId ? (
                  <form className="buyer-action-form" onSubmit={(event) => applyAccountStatus(item.id, event)}>
                    <label>
                      {isArabic ? 'تغيير حالة الحساب' : 'Set account status'}
                      <select name="accountStatus" defaultValue={item.subjectUserStatus === 'active' ? 'suspended' : 'active'}>
                        {accountStatusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {isArabic ? 'ملاحظة' : 'Note'}
                      <textarea name="accountNote" rows={2} maxLength={1200} />
                    </label>
                    <button className="button-primary" type="submit" disabled={busyItem === item.id}>
                      {isArabic ? 'حفظ حالة الحساب' : 'Save account status'}
                    </button>
                  </form>
                ) : null}

                <form className="buyer-action-form" onSubmit={(event) => completeItem(item.id, event)}>
                  <label>
                    {isArabic ? 'إغلاق بدون تغيير' : 'Close without status change'}
                    <select name="result" defaultValue="no_change">
                      {resultOptions.map((result) => (
                        <option key={result} value={result}>{result}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {isArabic ? 'ملاحظة' : 'Note'}
                    <textarea name="note" rows={2} maxLength={1200} />
                  </label>
                  <button className="button-secondary" type="submit" disabled={busyItem === item.id}>
                    {busyItem === item.id
                      ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…')
                      : (isArabic ? 'إغلاق' : 'Close item')}
                  </button>
                </form>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
