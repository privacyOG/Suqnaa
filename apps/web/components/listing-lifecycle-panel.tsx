'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getListingLifecycle,
  renewListingLifecycle,
  type ListingLifecycleSnapshot
} from '../lib/listing-lifecycle-api';

export function ListingLifecyclePanel({
  locale,
  listingId
}: {
  locale: string;
  listingId: string;
}) {
  const isArabic = locale === 'ar';
  const [snapshot, setSnapshot] = useState<ListingLifecycleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getListingLifecycle(listingId));
    } catch (caught) {
      setSnapshot(null);
      setError(caught instanceof AuthedRequestError && caught.status === 404
        ? (isArabic ? 'لم يتم العثور على الإعلان.' : 'Listing not found.')
        : (isArabic ? 'تعذر تحميل دورة حياة الإعلان.' : 'Unable to load listing lifecycle.'));
    } finally {
      setLoading(false);
    }
  }, [isArabic, listingId]);

  useEffect(() => { void load(); }, [load]);

  async function renew() {
    if (!snapshot?.renewable || submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await renewListingLifecycle(listingId, snapshot.listing.version);
      setNotice(result.reactivated
        ? (isArabic ? 'تمت إعادة تنشيط الإعلان.' : 'Listing reactivated.')
        : (isArabic ? 'تم تجديد الإعلان.' : 'Listing renewed.'));
      await load();
    } catch (caught) {
      if (caught instanceof AuthedRequestError && caught.status === 409) {
        setError(isArabic
          ? 'تغيّر الإعلان أو لم يعد مؤهلاً للتجديد. أعد تحميل الحالة.'
          : 'The listing changed or is not currently eligible for renewal. Reload its status.');
      } else {
        setError(isArabic ? 'تعذر تجديد الإعلان.' : 'Unable to renew the listing.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="auth-status">{isArabic ? 'جارٍ تحميل حالة الإعلان…' : 'Loading listing lifecycle…'}</p>;
  }
  if (!snapshot) {
    return (
      <div className="seller-session-panel">
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button-secondary" type="button" onClick={() => void load()}>
          {isArabic ? 'إعادة المحاولة' : 'Retry'}
        </button>
      </div>
    );
  }

  const listing = snapshot.listing;
  const expiresAt = listing.expiresAt ? new Date(listing.expiresAt) : null;
  const renewalAt = snapshot.renewalAvailableAt ? new Date(snapshot.renewalAvailableAt) : null;
  const dateLocale = isArabic ? 'ar-AU' : 'en-AU';
  const stock = listing.availabilityStatus === 'service_available'
    ? (isArabic ? 'خدمة غير محدودة بالكمية' : 'Service availability is not quantity limited')
    : isArabic
      ? `المخزون المتاح: ${listing.availableQuantity ?? 0}`
      : `Available inventory: ${listing.availableQuantity ?? 0}`;

  return (
    <section className="seller-session-panel">
      <div className="eyebrow">{isArabic ? 'دورة حياة الإعلان' : 'Listing lifecycle'}</div>
      <h2>{listing.title ?? (isArabic ? 'الإعلان' : 'Listing')}</h2>
      <dl className="seller-listing-meta">
        <div><dt>{isArabic ? 'الحالة' : 'Status'}</dt><dd>{listing.status}</dd></div>
        <div><dt>{isArabic ? 'المخزون' : 'Inventory'}</dt><dd>{stock}</dd></div>
        <div>
          <dt>{isArabic ? 'ينتهي في' : 'Expires'}</dt>
          <dd>{expiresAt ? expiresAt.toLocaleString(dateLocale) : (isArabic ? 'غير محدد' : 'Not scheduled')}</dd>
        </div>
        <div>
          <dt>{isArabic ? 'التجديد متاح من' : 'Renewal available'}</dt>
          <dd>{listing.status === 'expired'
            ? (isArabic ? 'الآن' : 'Now')
            : renewalAt
              ? renewalAt.toLocaleString(dateLocale)
              : (isArabic ? 'الآن' : 'Now')}</dd>
        </div>
        <div><dt>{isArabic ? 'نسخة الحالة' : 'State version'}</dt><dd>{listing.version}</dd></div>
      </dl>

      {notice ? <p className="auth-status" role="status">{notice}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <div className="listing-actions">
        <button
          className="button-primary"
          type="button"
          disabled={!snapshot.renewable || submitting}
          onClick={() => void renew()}
        >
          {submitting
            ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…')
            : listing.status === 'expired'
              ? (isArabic ? 'إعادة تنشيط' : 'Reactivate listing')
              : (isArabic ? 'تجديد الإعلان' : 'Renew listing')}
        </button>
        <button className="button-secondary" type="button" disabled={submitting} onClick={() => void load()}>
          {isArabic ? 'إعادة تحميل الحالة' : 'Reload status'}
        </button>
        <a className="button-secondary" href={`/${locale}/sell/manage/${listingId}/edit`}>
          {isArabic ? 'تعديل التفاصيل' : 'Edit details'}
        </a>
      </div>

      {!snapshot.renewable ? (
        <p className="auth-status">
          {listing.status === 'active'
            ? (isArabic
                ? 'لا يمكن التجديد إلا داخل نافذة التجديد قبل تاريخ الانتهاء.'
                : 'Renewal becomes available only inside the renewal window before expiry.')
            : listing.status === 'expired' && listing.availabilityStatus === 'out_of_stock'
              ? (isArabic
                  ? 'أضف مخزوناً متاحاً قبل إعادة تنشيط الإعلان.'
                  : 'Add available inventory before reactivating this listing.')
              : (isArabic
                  ? 'لا يمكن تجديد الإعلان في حالته الحالية.'
                  : 'This listing cannot be renewed in its current state.')}
        </p>
      ) : null}
    </section>
  );
}
