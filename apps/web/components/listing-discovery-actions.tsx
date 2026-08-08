'use client';

import { useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getDiscoveryState,
  recordDiscoveryView,
  removeDiscoverySavedListing,
  removeDiscoveryWatchedListing,
  saveDiscoveryListing,
  watchDiscoveryListing
} from '../lib/discovery-api';

export function ListingDiscoveryActions({
  locale,
  listingId
}: {
  locale: string;
  listingId: string;
}) {
  const isArabic = locale === 'ar';
  const [saved, setSaved] = useState(false);
  const [watching, setWatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'saved' | 'watch' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getDiscoveryState(listingId),
      recordDiscoveryView(listingId)
    ]).then(([stateResult]) => {
      if (!active) return;
      if (stateResult.status === 'fulfilled') {
        setSaved(stateResult.value.saved);
        setWatching(stateResult.value.watching);
      } else {
        setError(isArabic ? 'تعذر تحميل حالة الحفظ.' : 'Unable to load saved-item status.');
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [listingId, isArabic]);

  async function toggleSaved() {
    if (busy) return;
    setBusy('saved');
    setError(null);
    try {
      if (saved) {
        await removeDiscoverySavedListing(listingId);
        setSaved(false);
      } else {
        await saveDiscoveryListing(listingId);
        setSaved(true);
      }
    } catch (caught) {
      setError(caught instanceof AuthedRequestError
        ? caught.message
        : (isArabic ? 'تعذر تحديث العناصر المحفوظة.' : 'Unable to update saved items.'));
    } finally {
      setBusy(null);
    }
  }

  async function toggleWatch() {
    if (busy) return;
    setBusy('watch');
    setError(null);
    try {
      if (watching) {
        await removeDiscoveryWatchedListing(listingId);
        setWatching(false);
      } else {
        await watchDiscoveryListing(listingId);
        setWatching(true);
      }
    } catch (caught) {
      setError(caught instanceof AuthedRequestError
        ? caught.message
        : (isArabic ? 'تعذر تحديث قائمة المراقبة.' : 'Unable to update the watchlist.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="owner-listing-panel" aria-label={isArabic ? 'الحفظ والمراقبة' : 'Save and watch'}>
      <strong>{isArabic ? 'احفظ الإعلان أو راقبه' : 'Save or watch this listing'}</strong>
      <p>{isArabic
        ? 'الحفظ يحتفظ بالإعلان للرجوع إليه، والمراقبة تضعه في قائمة منفصلة للمتابعة.'
        : 'Saved items are for later reference; watched items stay in a separate follow-up list.'}</p>
      <div className="actions">
        <button className="button-secondary" type="button" disabled={loading || busy !== null} onClick={toggleSaved}>
          {busy === 'saved'
            ? (isArabic ? 'جارٍ الحفظ…' : 'Updating…')
            : saved
              ? (isArabic ? 'إزالة من المحفوظات' : 'Remove saved')
              : (isArabic ? 'حفظ الإعلان' : 'Save listing')}
        </button>
        <button className="button-secondary" type="button" disabled={loading || busy !== null} onClick={toggleWatch}>
          {busy === 'watch'
            ? (isArabic ? 'جارٍ التحديث…' : 'Updating…')
            : watching
              ? (isArabic ? 'إزالة من المراقبة' : 'Stop watching')
              : (isArabic ? 'إضافة للمراقبة' : 'Watch listing')}
        </button>
        <a className="button-secondary" href={`/${locale}/account/discovery`}>
          {isArabic ? 'مركز المتابعة' : 'Discovery centre'}
        </a>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </section>
  );
}
