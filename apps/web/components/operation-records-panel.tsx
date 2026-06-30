'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getOperationRecords,
  type OperationRecordItem
} from '../lib/operations-api';

export interface OperationRecordsPanelProps {
  locale: string;
}

const actionOptions = [
  'operations.queue.complete',
  'operations.listing_status',
  'operations.account_status'
];

const entityTypeOptions = [
  'report',
  'listing',
  'user'
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

function metadataSummary(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 6);
  if (entries.length === 0) {
    return '—';
  }
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
}

export function OperationRecordsPanel({ locale }: OperationRecordsPanelProps) {
  const isArabic = locale === 'ar';
  const [items, setItems] = useState<OperationRecordItem[]>([]);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [draftAction, setDraftAction] = useState('');
  const [draftEntityType, setDraftEntityType] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setNextCursor(null);

    getOperationRecords({
      limit: 25,
      action: action || undefined,
      entityType: entityType || undefined
    })
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
          setError(isArabic ? 'تعذر تحميل السجل.' : 'Could not load records.');
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
  }, [action, entityType, isArabic]);

  function updateFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAction(draftAction);
    setEntityType(draftEntityType);
  }

  function resetFilters() {
    setDraftAction('');
    setDraftEntityType('');
    setAction('');
    setEntityType('');
  }

  async function loadMore() {
    if (!nextCursor) {
      return;
    }
    setLoadingMore(true);
    setError(null);
    try {
      const payload = await getOperationRecords({
        limit: 25,
        before: nextCursor,
        action: action || undefined,
        entityType: entityType || undefined
      });
      setItems((current) => [...current, ...payload.items]);
      setNextCursor(payload.pagination.nextCursor);
    } catch {
      setError(isArabic ? 'تعذر تحميل المزيد.' : 'Could not load more records.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="operations-panel">
      <div className="catalog-header">
        <div>
          <span className="buyer-action-label">{isArabic ? 'السجل' : 'Records'}</span>
          <h2>{isArabic ? 'آخر إجراءات العمليات' : 'Recent operation records'}</h2>
          <p>
            {isArabic
              ? 'عرض داخلي للقرارات المحفوظة في قاعدة البيانات.'
              : 'Read-only view of durable internal records stored in the database.'}
          </p>
        </div>
      </div>

      <form className="buyer-action-form" onSubmit={updateFilters}>
        <label>
          {isArabic ? 'نوع الإجراء' : 'Action type'}
          <select
            name="action"
            value={draftAction}
            onChange={(event) => setDraftAction(event.currentTarget.value)}
          >
            <option value="">{isArabic ? 'كل الإجراءات' : 'All actions'}</option>
            {actionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          {isArabic ? 'نوع العنصر' : 'Entity type'}
          <select
            name="entityType"
            value={draftEntityType}
            onChange={(event) => setDraftEntityType(event.currentTarget.value)}
          >
            <option value="">{isArabic ? 'كل العناصر' : 'All entities'}</option>
            {entityTypeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button className="button-primary" type="submit">
            {isArabic ? 'تطبيق الفلاتر' : 'Apply filters'}
          </button>
          <button className="button-secondary" type="button" onClick={resetFilters}>
            {isArabic ? 'إعادة ضبط' : 'Reset'}
          </button>
        </div>
      </form>

      {loading ? <p>{isArabic ? 'جارٍ التحميل…' : 'Loading…'}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="empty-catalog">
          <strong>{isArabic ? 'لا يوجد سجل' : 'No records'}</strong>
          <p>{isArabic ? 'لا توجد سجلات محفوظة بعد.' : 'There are no stored records yet.'}</p>
        </div>
      ) : null}

      <div className="operations-list">
        {items.map((item) => (
          <article className="buyer-action-card" key={item.id}>
            <div>
              <span className="buyer-action-label">{item.action}</span>
              <h3>{item.entityType} · {shortId(item.entityId)}</h3>
              <p>{metadataSummary(item.metadata)}</p>
            </div>

            <dl className="listing-facts">
              <div>
                <dt>{isArabic ? 'المستخدم' : 'Actor'}</dt>
                <dd>{shortId(item.actorId)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'العنصر' : 'Entity'}</dt>
                <dd>{item.entityType}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'المعرف' : 'ID'}</dt>
                <dd>{shortId(item.entityId)}</dd>
              </div>
              <div>
                <dt>{isArabic ? 'التاريخ' : 'Created'}</dt>
                <dd>{formatDate(item.createdAt, locale)}</dd>
              </div>
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
