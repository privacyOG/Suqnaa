'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  deleteListingMedia,
  getMyListings,
  updateListingStatus,
  type ListingAvailabilityStatus,
  type ListingStatus,
  type SellerListing
} from '../lib/listing-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export interface MyListingsPanelProps {
  locale: string;
}

const filters: Array<ListingStatus | 'all'> = [
  'all',
  'draft',
  'active',
  'reserved',
  'sold',
  'expired',
  'removed'
];

const transitions: Record<ListingStatus, ListingStatus[]> = {
  draft: ['active', 'removed'],
  active: ['reserved', 'sold', 'removed'],
  reserved: ['active', 'sold', 'removed'],
  sold: [],
  expired: ['active', 'removed'],
  removed: []
};

function statusLabel(status: ListingStatus | 'all', isArabic: boolean): string {
  const labels: Record<ListingStatus | 'all', [string, string]> = {
    all: ['All', 'الكل'],
    draft: ['Draft', 'مسودة'],
    active: ['Active', 'منشور'],
    reserved: ['Reserved', 'محجوز'],
    sold: ['Sold', 'تم البيع'],
    expired: ['Expired', 'منتهي'],
    removed: ['Removed', 'محذوف']
  };
  return labels[status][isArabic ? 1 : 0];
}

function actionLabel(status: ListingStatus, isArabic: boolean): string {
  const labels: Record<ListingStatus, [string, string]> = {
    draft: ['Move to draft', 'نقل إلى المسودة'],
    active: ['Publish', 'نشر'],
    reserved: ['Mark reserved', 'وضع كمحجوز'],
    sold: ['Mark sold', 'وضع كمباع'],
    expired: ['Mark expired', 'وضع كمنتهي'],
    removed: ['Remove', 'حذف']
  };
  return labels[status][isArabic ? 1 : 0];
}

function conditionLabel(condition: SellerListing['condition'], isArabic: boolean): string {
  const labels: Record<SellerListing['condition'], [string, string]> = {
    new: ['New', 'جديد'],
    like_new: ['Like new', 'كالجديد'],
    good: ['Good', 'جيد'],
    fair: ['Fair', 'مقبول'],
    parts_or_repair: ['Parts or repair', 'للقطع أو الإصلاح']
  };
  return labels[condition][isArabic ? 1 : 0];
}

function availabilityLabel(status: ListingAvailabilityStatus, isArabic: boolean): string {
  const labels: Record<ListingAvailabilityStatus, [string, string]> = {
    in_stock: ['In stock', 'متوفر'],
    limited: ['Limited', 'كمية محدودة'],
    out_of_stock: ['Out of stock', 'غير متوفر'],
    service_available: ['Service available', 'خدمة متاحة']
  };
  return labels[status][isArabic ? 1 : 0];
}

function quantityLabel(listing: SellerListing, isArabic: boolean): string {
  if (listing.availableQuantity === null) {
    return availabilityLabel(listing.availabilityStatus, isArabic);
  }
  const unit = listing.unitLabel ?? (isArabic ? 'عنصر' : 'item');
  return `${listing.availableQuantity} ${unit}`;
}

function formatPrice(listing: SellerListing, locale: string): string {
  const amount = Number(listing.priceAmount);
  if (!Number.isFinite(amount)) {
    return `${listing.priceAmount} ${listing.currencyCode}`;
  }

  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
      style: 'currency',
      currency: listing.currencyCode,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${listing.currencyCode}`;
  }
}

function failureMessage(caught: unknown, isArabic: boolean): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic
        ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.'
        : 'Your account session ended. Sign in again.';
    }
    if (caught.status === 409) {
      return isArabic
        ? 'تغيّر الإعلان. حدّث القائمة ثم أعد المحاولة.'
        : 'The listing changed. Refresh the list and try again.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `محاولات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many attempts. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
    }
    if (caught.payload.requiresHumanCheck) {
      return isArabic
        ? 'أكمل الفحص الأمني مرة أخرى.'
        : 'Complete the security check again.';
    }
  }

  return isArabic
    ? 'تعذر إكمال الطلب حالياً.'
    : 'The request could not be completed right now.';
}

export function MyListingsPanel({ locale }: MyListingsPanelProps) {
  const isArabic = locale === 'ar';
  const [filter, setFilter] = useState<ListingStatus | 'all'>('all');
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeAction = configuration?.actions.listingStatusUpdate;
  const challengeReady = !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);
  const busy = updatingId !== null || deletingMediaId !== null;

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

  const loadListings = useCallback(async (
    selectedFilter: ListingStatus | 'all',
    cursor?: string
  ) => {
    const append = Boolean(cursor);
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);

    try {
      const response = await getMyListings({
        status: selectedFilter === 'all' ? undefined : selectedFilter,
        limit: 20,
        before: cursor
      });

      setListings((current) => append
        ? [...current, ...response.listings]
        : response.listings
      );
      setHasMore(response.pagination.hasMore);
      setNextCursor(response.pagination.nextCursor);
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
      if (!append) {
        setListings([]);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [isArabic]);

  useEffect(() => {
    void loadListings(filter);
  }, [filter, loadListings]);

  const listingCountText = useMemo(() => {
    if (isArabic) {
      return `${listings.length} إعلان`;
    }
    return `${listings.length} listing${listings.length === 1 ? '' : 's'}`;
  }, [isArabic, listings.length]);

  async function changeStatus(listing: SellerListing, status: ListingStatus) {
    if (!challengeReady || busy) {
      return;
    }

    if ((status === 'sold' || status === 'removed') && !window.confirm(
      isArabic
        ? `هل أنت متأكد من تغيير حالة «${listing.title}» إلى ${statusLabel(status, true)}؟`
        : `Change “${listing.title}” to ${statusLabel(status, false)}?`
    )) {
      return;
    }

    setUpdatingId(listing.id);
    setError(null);

    try {
      const response = await updateListingStatus(
        listing.id,
        status,
        challengeToken ?? undefined
      );
      const updatedStatus = response.listing.status;

      setListings((current) => {
        if (filter !== 'all' && filter !== updatedStatus) {
          return current.filter((item) => item.id !== listing.id);
        }

        return current.map((item) =>
          item.id === listing.id
            ? {
                ...item,
                status: updatedStatus,
                updatedAt: response.listing.updatedAt ?? item.updatedAt
              }
            : item
        );
      });
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setUpdatingId(null);
    }
  }

  async function removeCoverPhoto(listing: SellerListing, mediaId: string) {
    if (!challengeReady || busy) {
      return;
    }

    if (!window.confirm(
      isArabic
        ? `هل تريد حذف الصورة الرئيسية من «${listing.title}»؟`
        : `Remove the cover photo from “${listing.title}”?`
    )) {
      return;
    }

    setDeletingMediaId(mediaId);
    setError(null);

    try {
      const response = await deleteListingMedia(
        listing.id,
        mediaId,
        challengeToken ?? undefined
      );

      setListings((current) => current.map((item) =>
        item.id === listing.id
          ? {
              ...item,
              media: item.media.filter((photo) => photo.id !== mediaId),
              mediaCount: response.mediaCount
            }
          : item
      ));

      if (response.mediaCount > 0) {
        await loadListings(filter);
      }
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setDeletingMediaId(null);
    }
  }

  return (
    <section className="seller-dashboard">
      <div className="seller-dashboard-toolbar">
        <div>
          <strong>{isArabic ? 'إعلاناتي' : 'My listings'}</strong>
          <span>{listingCountText}</span>
        </div>
        <label>
          <span>{isArabic ? 'الحالة' : 'Status'}</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as ListingStatus | 'all')}
            disabled={loading || busy}
          >
            {filters.map((item) => (
              <option key={item} value={item}>{statusLabel(item, isArabic)}</option>
            ))}
          </select>
        </label>
      </div>

      {challengeEnabled && siteKey && challengeAction ? (
        <div className="seller-security-check">
          <p>
            {isArabic
              ? 'أكمل الفحص الأمني قبل تغيير حالة إعلان أو حذف صورة.'
              : 'Complete the security check before changing a listing status or deleting a photo.'}
          </p>
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
            ? 'تعذر تحميل إعدادات الفحص الأمني. عرض الإعلانات متاح، لكن التغييرات متوقفة.'
            : 'Security settings could not be loaded. Listings remain visible, but changes are unavailable.'}
        </p>
      ) : null}

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="auth-status" aria-live="polite">
          {isArabic ? 'جارٍ تحميل الإعلانات…' : 'Loading listings…'}
        </p>
      ) : listings.length === 0 ? (
        <div className="empty-listings">
          <strong>{isArabic ? 'لا توجد إعلانات هنا' : 'No listings here'}</strong>
          <p>
            {isArabic
              ? 'أنشئ مسودة جديدة أو اختر حالة أخرى.'
              : 'Create a new draft or choose another status.'}
          </p>
          <a className="button-primary" href={`/${locale}/sell`}>
            {isArabic ? 'إنشاء إعلان' : 'Create listing'}
          </a>
        </div>
      ) : (
        <div className="seller-listing-grid">
          {listings.map((listing) => {
            const location = [listing.suburb, listing.city, listing.region, listing.countryCode]
              .filter(Boolean)
              .join(', ');
            const availableTransitions = transitions[listing.status];
            const firstPhoto = listing.media[0];
            const mediaChangesAllowed = listing.status !== 'sold' && listing.status !== 'removed';

            return (
              <article className="seller-listing-card" key={listing.id}>
                {firstPhoto ? (
                  <>
                    <img
                      className="seller-listing-photo"
                      src={firstPhoto.url}
                      alt={firstPhoto.altText ?? listing.title}
                      loading="lazy"
                    />
                    {mediaChangesAllowed ? (
                      <button
                        className="button-secondary danger-button"
                        type="button"
                        disabled={
                          busy ||
                          configurationError ||
                          configuration === null ||
                          !challengeReady
                        }
                        onClick={() => void removeCoverPhoto(listing, firstPhoto.id)}
                      >
                        {deletingMediaId === firstPhoto.id
                          ? (isArabic ? 'جارٍ حذف الصورة…' : 'Removing photo…')
                          : (isArabic ? 'حذف الصورة الرئيسية' : 'Remove cover photo')}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="seller-listing-photo-placeholder" aria-hidden="true">
                    {listing.title.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="seller-listing-heading">
                  <div>
                    <span className={`listing-status listing-status-${listing.status}`}>
                      {statusLabel(listing.status, isArabic)}
                    </span>
                    <h2>{listing.title}</h2>
                  </div>
                  <strong>{formatPrice(listing, locale)}</strong>
                </div>

                <p className="seller-listing-description">{listing.description}</p>

                <dl className="seller-listing-meta">
                  <div>
                    <dt>{isArabic ? 'الحالة' : 'Condition'}</dt>
                    <dd>{conditionLabel(listing.condition, isArabic)}</dd>
                  </div>
                  <div>
                    <dt>{isArabic ? 'التوفر' : 'Availability'}</dt>
                    <dd>{quantityLabel(listing, isArabic)}</dd>
                  </div>
                  <div>
                    <dt>{isArabic ? 'الصور' : 'Photos'}</dt>
                    <dd>{listing.mediaCount}</dd>
                  </div>
                  <div>
                    <dt>{isArabic ? 'الموقع' : 'Location'}</dt>
                    <dd>{location || (isArabic ? 'غير محدد' : 'Not specified')}</dd>
                  </div>
                  <div>
                    <dt>{isArabic ? 'التسليم' : 'Fulfilment'}</dt>
                    <dd>
                      {[
                        listing.allowPickup ? (isArabic ? 'استلام' : 'Pickup') : null,
                        listing.allowDelivery ? (isArabic ? 'توصيل' : 'Delivery') : null
                      ].filter(Boolean).join(' · ') || '—'}
                    </dd>
                  </div>
                </dl>

                {availableTransitions.length > 0 ? (
                  <div className="listing-actions">
                    {availableTransitions.map((status) => (
                      <button
                        key={status}
                        className={status === 'removed' ? 'button-secondary danger-button' : 'button-secondary'}
                        type="button"
                        disabled={
                          busy ||
                          configurationError ||
                          configuration === null ||
                          !challengeReady
                        }
                        onClick={() => void changeStatus(listing, status)}
                      >
                        {updatingId === listing.id
                          ? (isArabic ? 'جارٍ التحديث…' : 'Updating…')
                          : actionLabel(status, isArabic)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="listing-final-status">
                    {isArabic
                      ? 'لا توجد إجراءات إضافية لهذه الحالة.'
                      : 'No further status actions are available.'}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {hasMore && nextCursor ? (
        <button
          className="button-secondary load-more-button"
          type="button"
          disabled={loadingMore || busy}
          onClick={() => void loadListings(filter, nextCursor)}
        >
          {loadingMore
            ? (isArabic ? 'جارٍ التحميل…' : 'Loading…')
            : (isArabic ? 'تحميل المزيد' : 'Load more')}
        </button>
      ) : null}
    </section>
  );
}
