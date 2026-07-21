'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  deleteListingMedia,
  getMyListingMedia,
  getMyListings,
  uploadListingMedia,
  type ListingMedia,
  type OwnerListingMediaResponse,
  type SellerListing
} from '../lib/listing-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

const allowedPhotoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumPhotoBytes = 4 * 1024 * 1024;
const maximumPhotoCount = 8;

type PendingOperation =
  | {
      type: 'upload';
      file: File;
      width?: number;
      height?: number;
    }
  | {
      type: 'delete';
      media: ListingMedia;
    };

function imageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: image.naturalWidth || undefined,
        height: image.naturalHeight || undefined
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    image.src = url;
  });
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '—';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
        ? 'لم يعد الإعلان أو الصورة متاحاً لهذا الحساب.'
        : 'The listing or photo is no longer available to this account.';
    }
    if (caught.status === 409) {
      return isArabic
        ? 'تغيّرت حالة الإعلان أو وصل إلى الحد الأقصى للصور. حدّث وحاول مرة أخرى.'
        : 'The listing changed or reached its photo limit. Refresh and try again.';
    }
    if (caught.status === 413) {
      return isArabic
        ? 'حجم الصورة أكبر من 4 ميجابايت.'
        : 'The photo is larger than 4 MB.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `طلبات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many requests. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
    }
    if (caught.status === 403 || caught.payload.requiresHumanCheck) {
      return isArabic
        ? 'تعذر التحقق من الفحص الأمني. أكمله مرة أخرى.'
        : 'The security check could not be verified. Complete it again.';
    }
  }

  return isArabic
    ? 'تعذر تحديث صور الإعلان حالياً.'
    : 'The listing photos could not be updated right now.';
}

function statusLabel(status: SellerListing['status'], isArabic: boolean): string {
  const labels: Record<SellerListing['status'], [string, string]> = {
    draft: ['Draft', 'مسودة'],
    active: ['Active', 'منشور'],
    reserved: ['Reserved', 'محجوز'],
    sold: ['Sold', 'تم البيع'],
    expired: ['Expired', 'منتهي'],
    removed: ['Removed', 'محذوف']
  };
  return labels[status][isArabic ? 1 : 0];
}

export function ListingMediaManagerPanel({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [configuration, setConfiguration] =
    useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [selectedListingId, setSelectedListingId] = useState('');
  const [gallery, setGallery] = useState<OwnerListingMediaResponse | null>(null);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [pendingOperation, setPendingOperation] =
    useState<PendingOperation | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadGallery = useCallback(async (listingId: string) => {
    if (!listingId) {
      setGallery(null);
      return;
    }
    setLoadingGallery(true);
    setError(null);
    try {
      const response = await getMyListingMedia(listingId);
      setGallery(response);
    } catch (caught) {
      setGallery(null);
      setError(failureMessage(caught, isArabic));
    } finally {
      setLoadingGallery(false);
    }
  }, [isArabic]);

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

    getMyListings({ limit: 50 })
      .then((response) => {
        if (!active) {
          return;
        }
        setListings(response.listings);
        const first = response.listings[0]?.id ?? '';
        setSelectedListingId(first);
        if (first) {
          void loadGallery(first);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(failureMessage(caught, isArabic));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingListings(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isArabic, loadGallery]);

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedListingId) ?? null,
    [listings, selectedListingId]
  );
  const mediaChangesAllowed = Boolean(
    selectedListing &&
    selectedListing.status !== 'sold' &&
    selectedListing.status !== 'removed'
  );
  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeAction = pendingOperation?.type === 'upload'
    ? configuration?.actions.listingMediaUpload
    : pendingOperation?.type === 'delete'
      ? configuration?.actions.listingMediaDelete
      : null;
  const challengeReady = !challengeEnabled || Boolean(
    siteKey && challengeAction && challengeToken
  );
  const remainingSlots = Math.max(
    0,
    maximumPhotoCount - (gallery?.mediaCount ?? 0)
  );

  function clearPendingOperation() {
    setPendingOperation(null);
    setChallengeToken(null);
    setResetKey((value) => value + 1);
    setInputKey((value) => value + 1);
  }

  async function chooseUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setSuccess(null);
    if (!file) {
      clearPendingOperation();
      return;
    }
    if (!allowedPhotoTypes.has(file.type)) {
      setError(
        isArabic
          ? 'استخدم صورة JPG أو PNG أو WebP فقط.'
          : 'Use a JPG, PNG, or WebP photo.'
      );
      clearPendingOperation();
      return;
    }
    if (file.size <= 0 || file.size > maximumPhotoBytes) {
      setError(
        isArabic
          ? 'يجب ألا يتجاوز حجم الصورة 4 ميجابايت.'
          : 'The photo must be 4 MB or smaller.'
      );
      clearPendingOperation();
      return;
    }
    if (!mediaChangesAllowed || remainingSlots === 0) {
      setError(
        isArabic
          ? 'لا يمكن إضافة صور أخرى لهذا الإعلان.'
          : 'No more photos can be added to this listing.'
      );
      clearPendingOperation();
      return;
    }

    const dimensions = await imageDimensions(file);
    setChallengeToken(null);
    setResetKey((value) => value + 1);
    setPendingOperation({ type: 'upload', file, ...dimensions });
  }

  function chooseDelete(media: ListingMedia) {
    if (!mediaChangesAllowed || busy) {
      return;
    }
    setError(null);
    setSuccess(null);
    setChallengeToken(null);
    setResetKey((value) => value + 1);
    setPendingOperation({ type: 'delete', media });
  }

  async function performOperation() {
    if (
      !pendingOperation ||
      !selectedListing ||
      !configuration ||
      configurationError ||
      !challengeReady ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (pendingOperation.type === 'upload') {
        await uploadListingMedia(
          selectedListing.id,
          {
            image: pendingOperation.file,
            width: pendingOperation.width,
            height: pendingOperation.height,
            altText: selectedListing.title,
            sortOrder: gallery?.mediaCount ?? 0
          },
          challengeToken ?? undefined
        );
        setSuccess(
          isArabic
            ? 'تمت إضافة الصورة إلى الإعلان.'
            : 'The photo was added to the listing.'
        );
      } else {
        const response = await deleteListingMedia(
          selectedListing.id,
          pendingOperation.media.id,
          challengeToken ?? undefined
        );
        if (!response.deleted || response.mediaId !== pendingOperation.media.id) {
          throw new Error('Invalid media deletion response');
        }
        setSuccess(
          isArabic
            ? 'تم حذف الصورة من الإعلان.'
            : 'The photo was removed from the listing.'
        );
      }

      clearPendingOperation();
      await loadGallery(selectedListing.id);
      setListings((current) => current.map((listing) =>
        listing.id === selectedListing.id
          ? { ...listing, mediaCount: pendingOperation.type === 'upload'
              ? listing.mediaCount + 1
              : Math.max(0, listing.mediaCount - 1) }
          : listing
      ));
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="seller-dashboard">
      <div className="seller-dashboard-toolbar">
        <div>
          <strong>{isArabic ? 'إدارة الصور' : 'Manage photos'}</strong>
          <span>
            {isArabic
              ? 'كل عملية رفع أو حذف تستخدم تحققاً مخصصاً.'
              : 'Each upload or deletion uses its own action-bound verification.'}
          </span>
        </div>
        <label>
          <span>{isArabic ? 'الإعلان' : 'Listing'}</span>
          <select
            value={selectedListingId}
            disabled={loadingListings || busy || listings.length === 0}
            onChange={(event) => {
              const listingId = event.target.value;
              setSelectedListingId(listingId);
              clearPendingOperation();
              setSuccess(null);
              void loadGallery(listingId);
            }}
          >
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.title} · {statusLabel(listing.status, isArabic)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {configurationError ? (
        <p className="auth-error" role="alert">
          {isArabic
            ? 'تعذر تحميل إعدادات الأمان. إدارة الصور متوقفة.'
            : 'Security settings could not be loaded. Photo management is unavailable.'}
        </p>
      ) : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {success ? <p className="auth-status" role="status">{success}</p> : null}

      {loadingListings ? (
        <p className="auth-status">{isArabic ? 'جارٍ تحميل الإعلانات…' : 'Loading listings…'}</p>
      ) : listings.length === 0 ? (
        <div className="empty-listings">
          <strong>{isArabic ? 'لا توجد إعلانات' : 'No listings yet'}</strong>
          <a className="button-primary" href={`/${locale}/sell`}>
            {isArabic ? 'إنشاء إعلان' : 'Create listing'}
          </a>
        </div>
      ) : loadingGallery ? (
        <p className="auth-status">{isArabic ? 'جارٍ تحميل الصور…' : 'Loading photos…'}</p>
      ) : selectedListing && gallery ? (
        <>
          <div className="seller-session-summary">
            <span>{statusLabel(selectedListing.status, isArabic)}</span>
            <strong>{selectedListing.title}</strong>
            <small>
              {isArabic
                ? `${gallery.mediaCount} من ${maximumPhotoCount} صور`
                : `${gallery.mediaCount} of ${maximumPhotoCount} photos`}
            </small>
          </div>

          {!mediaChangesAllowed ? (
            <p className="auth-status">
              {isArabic
                ? 'لا يمكن تغيير صور إعلان مباع أو محذوف.'
                : 'Photos cannot be changed on a sold or removed listing.'}
            </p>
          ) : null}

          <div className="photo-upload-panel">
            <label>
              {isArabic ? 'إضافة صورة واحدة' : 'Add one photo'}
              <input
                key={inputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={
                  !mediaChangesAllowed ||
                  remainingSlots === 0 ||
                  busy ||
                  configurationError ||
                  configuration === null
                }
                onChange={(event) => void chooseUpload(event)}
              />
            </label>
            <p>
              {isArabic
                ? `المتبقي ${remainingSlots}. JPG أو PNG أو WebP، بحد أقصى 4 ميجابايت.`
                : `${remainingSlots} slot${remainingSlots === 1 ? '' : 's'} remaining. JPG, PNG, or WebP, maximum 4 MB.`}
            </p>
          </div>

          {gallery.media.length === 0 ? (
            <div className="seller-listing-photo-placeholder" aria-hidden="true">
              {selectedListing.title.slice(0, 1).toUpperCase()}
            </div>
          ) : (
            <div className="seller-listing-grid">
              {gallery.media.map((media, index) => (
                <article className="seller-listing-card" key={media.id}>
                  <img
                    className="seller-listing-photo"
                    src={media.url}
                    alt={media.altText ?? selectedListing.title}
                    loading="lazy"
                  />
                  <div className="seller-listing-heading">
                    <strong>
                      {isArabic ? `الصورة ${index + 1}` : `Photo ${index + 1}`}
                    </strong>
                    <span>{formatBytes(media.sizeBytes)}</span>
                  </div>
                  <button
                    className="button-secondary danger-button"
                    type="button"
                    disabled={!mediaChangesAllowed || busy || configurationError}
                    onClick={() => chooseDelete(media)}
                  >
                    {isArabic ? 'حذف هذه الصورة' : 'Delete this photo'}
                  </button>
                </article>
              ))}
            </div>
          )}

          {pendingOperation ? (
            <div
              className="offer-confirmation"
              role="dialog"
              aria-modal="true"
              aria-labelledby="listing-media-operation-title"
            >
              <div>
                <span className="buyer-action-label">
                  {pendingOperation.type === 'upload'
                    ? (isArabic ? 'إضافة صورة' : 'Add photo')
                    : (isArabic ? 'حذف صورة' : 'Delete photo')}
                </span>
                <h2 id="listing-media-operation-title">
                  {pendingOperation.type === 'upload'
                    ? pendingOperation.file.name
                    : (isArabic ? 'تأكيد حذف الصورة' : 'Confirm photo deletion')}
                </h2>
                <p>
                  {pendingOperation.type === 'upload'
                    ? (isArabic
                      ? 'ستُضاف هذه الصورة إلى نهاية معرض الإعلان.'
                      : 'This photo will be added to the end of the listing gallery.')
                    : (isArabic
                      ? 'سيتم حذف الصورة نهائياً من التخزين وسجل الإعلان.'
                      : 'The photo will be permanently removed from storage and the listing record.')}
                </p>
              </div>

              {challengeEnabled && siteKey && challengeAction ? (
                <>
                  <ChallengeProviderScript />
                  <ChallengeWidget
                    key={`${challengeAction}-${resetKey}`}
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
                </>
              ) : null}

              <div className="offer-confirmation-actions">
                <button
                  className={pendingOperation.type === 'delete'
                    ? 'button-secondary danger-button'
                    : 'button-primary'}
                  type="button"
                  disabled={
                    busy ||
                    !configuration ||
                    configurationError ||
                    !challengeReady
                  }
                  onClick={() => void performOperation()}
                >
                  {busy
                    ? (isArabic ? 'جارٍ التنفيذ…' : 'Working…')
                    : pendingOperation.type === 'upload'
                      ? (isArabic ? 'رفع الصورة' : 'Upload photo')
                      : (isArabic ? 'حذف الصورة' : 'Delete photo')}
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={clearPendingOperation}
                >
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
