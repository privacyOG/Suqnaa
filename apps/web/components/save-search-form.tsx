'use client';

import { useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  createDiscoverySavedSearch,
  type SavedSearchFilterInput
} from '../lib/discovery-api';

export function SaveSearchForm({
  locale,
  filters
}: {
  locale: string;
  filters: SavedSearchFilterInput;
}) {
  const isArabic = locale === 'ar';
  const [name, setName] = useState(
    typeof filters.q === 'string' && filters.q.trim()
      ? filters.q.trim().slice(0, 120)
      : (isArabic ? 'بحث محفوظ' : 'Saved search')
  );
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || name.trim().length === 0) return;
    setBusy(true);
    setSuccess(false);
    setError(null);
    try {
      await createDiscoverySavedSearch(name.trim(), filters);
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof AuthedRequestError
        ? caught.message
        : (isArabic ? 'تعذر حفظ البحث.' : 'Unable to save this search.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="owner-listing-panel" onSubmit={submit}>
      <strong>{isArabic ? 'احفظ هذا البحث' : 'Save this search'}</strong>
      <p>{isArabic
        ? 'سننشئ إشعاراً داخل سوقنا عندما يطابق إعلان جديد أو محدّث هذه الخيارات.'
        : 'Suqnaa will create an in-app notification when a new or updated listing matches these filters.'}</p>
      <label>
        <span>{isArabic ? 'اسم البحث' : 'Search name'}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={1}
          maxLength={120}
          required
        />
      </label>
      <div className="actions">
        <button className="button-secondary" type="submit" disabled={busy}>
          {busy ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (isArabic ? 'حفظ البحث' : 'Save search')}
        </button>
        <a className="button-secondary" href={`/${locale}/account/discovery`}>
          {isArabic ? 'عمليات البحث المحفوظة' : 'Manage saved searches'}
        </a>
      </div>
      {success ? <p role="status">{isArabic ? 'تم حفظ البحث.' : 'Search saved.'}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </form>
  );
}
