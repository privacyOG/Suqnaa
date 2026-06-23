'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  createListingDraft,
  uploadListingMedia,
  deleteListingMedia,
  type ListingCondition,
  type ListingDraftResponse,
  type ListingMediaItem
} from '../lib/listing-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export interface SellListingFormProps {
  locale: string;
}

function errorMessage(
  caught: unknown,
  isArabic: boolean
): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic
        ? 'انتهت جلسة الحساب. سجّل الدخول ثم أعد المحاولة.'
        : 'Your account session ended. Sign in and try again.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `محاولات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''} ثم أعد المحاولة.`
        : `Too many attempts. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''} and try again.`;
    }
    if (caught.payload.requiresHumanCheck) {
      return isArabic
        ? 'تعذر التحقق من الفحص الأمني. أكمل الفحص مرة أخرى.'
        : 'The security check could not be verified. Complete it again.';
    }
    if (caught.status === 400) {
      return isArabic
        ? 'تحقق من بيانات الإعلان ثم أعد الإرسال.'
        : 'Check the listing details and submit again.';
    }
  }

  return isArabic
    ? 'تعذر حفظ الإعلان حالياً. حاول مرة أخرى.'
    : 'The listing could not be saved right now. Please try again.';
}

interface UploadedPhoto extends ListingMediaItem {
  localPreview?: string;
}

function PhotoUploadSection({
  listingId,
  isArabic
}: {
  listingId: string;
  isArabic: boolean;
}) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const remaining = 10 - photos.length;
    const toUpload = Array.from(files).slice(0, remaining);

    setUploading(true);
    setUploadError(null);

    for (const file of toUpload) {
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(isArabic ? 'حجم الصورة يجب أن يكون أقل من 10 ميجابايت.' : 'Each photo must be 10 MB or smaller.');
        continue;
      }

      const localPreview = URL.createObjectURL(file);

      try {
        const result = await uploadListingMedia(listingId, file);
        setPhotos((prev) => [
          ...prev,
          { ...result.media, localPreview }
        ]);
      } catch (err) {
        URL.revokeObjectURL(localPreview);
        const msg = err instanceof Error ? err.message : '';
        setUploadError(
          msg ||
          (isArabic ? 'تعذر رفع الصورة. حاول مرة أخرى.' : 'Photo upload failed. Please try again.')
        );
      }
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleDelete(mediaId: string) {
    try {
      await deleteListingMedia(listingId, mediaId);
      setPhotos((prev) => {
        const removed = prev.find((p) => p.id === mediaId);
        if (removed?.localPreview) {
          URL.revokeObjectURL(removed.localPreview);
        }
        return prev.filter((p) => p.id !== mediaId);
      });
    } catch {
      setUploadError(isArabic ? 'تعذر حذف الصورة.' : 'Could not delete the photo.');
    }
  }

  return (
    <div className="photo-upload-section">
      <h3>{isArabic ? 'أضف صوراً للإعلان' : 'Add photos to your listing'}</h3>
      <p className="photo-hint">
        {isArabic
          ? 'تزيد الصور من فرصة البيع. يمكنك رفع حتى 10 صور (JPEG أو PNG أو WebP).'
          : 'Photos improve your chances of selling. Up to 10 images (JPEG, PNG or WebP).'}
      </p>

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((photo) => (
            <div key={photo.id} className="photo-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.localPreview ?? photo.url ?? ''}
                alt=""
                width={96}
                height={96}
                style={{ objectFit: 'cover', borderRadius: 8 }}
              />
              <button
                type="button"
                className="photo-delete-btn"
                aria-label={isArabic ? 'حذف الصورة' : 'Delete photo'}
                onClick={() => handleDelete(photo.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length < 10 && (
        <label className="photo-upload-label">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
          <span className="button-secondary">
            {uploading
              ? (isArabic ? 'جارٍ الرفع…' : 'Uploading…')
              : (isArabic ? 'اختر صوراً' : 'Choose photos')}
          </span>
        </label>
      )}

      {uploadError && (
        <p className="auth-error" role="alert">{uploadError}</p>
      )}
    </div>
  );
}

export function SellListingForm({ locale }: SellListingFormProps) {
  const isArabic = locale === 'ar';
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ListingDraftResponse['listing'] | null>(null);

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

  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeAction = configuration?.actions.listingCreate;
  const challengeReady = !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);
  const configurationReady = configuration !== null && !configurationError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configurationReady || !challengeReady || submitting) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const priceAmount = Number(form.get('priceAmount'));
    const currencyCode = String(form.get('currencyCode') ?? '').trim().toUpperCase();
    const countryCode = String(form.get('countryCode') ?? '').trim().toUpperCase();
    const allowPickup = form.get('allowPickup') === 'on';
    const allowDelivery = form.get('allowDelivery') === 'on';

    if (!Number.isFinite(priceAmount) || priceAmount < 0) {
      setError(isArabic ? 'أدخل سعراً صحيحاً.' : 'Enter a valid price.');
      return;
    }
    if (currencyCode.length !== 3 || countryCode.length !== 2) {
      setError(
        isArabic
          ? 'استخدم رمز عملة من 3 أحرف ورمز دولة من حرفين.'
          : 'Use a 3-letter currency code and a 2-letter country code.'
      );
      return;
    }
    if (!allowPickup && !allowDelivery) {
      setError(
        isArabic
          ? 'اختر الاستلام أو التوصيل على الأقل.'
          : 'Select pickup or delivery.'
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setCreated(null);

    try {
      const response = await createListingDraft(
        {
          title: String(form.get('title') ?? '').trim(),
          description: String(form.get('description') ?? '').trim(),
          priceAmount,
          currencyCode,
          condition: String(form.get('condition') ?? 'good') as ListingCondition,
          countryCode,
          region: String(form.get('region') ?? '').trim() || undefined,
          city: String(form.get('city') ?? '').trim() || undefined,
          suburb: String(form.get('suburb') ?? '').trim() || undefined,
          allowPickup,
          allowDelivery
        },
        challengeToken ?? undefined
      );

      setCreated(response.listing);
      formElement.reset();
    } catch (caught) {
      setError(errorMessage(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setSubmitting(false);
    }
  }

  if (configurationError) {
    return (
      <p className="auth-error" role="alert">
        {isArabic
          ? 'تعذر تحميل إعدادات الفحص الأمني.'
          : 'The security-check configuration could not be loaded.'}
      </p>
    );
  }

  if (created) {
    return (
      <div className="listing-created-shell">
        <div className="listing-success" role="status">
          <strong>{isArabic ? 'تم حفظ المسودة' : 'Draft saved'}</strong>
          <span>{created.title}</span>
        </div>

        <PhotoUploadSection listingId={created.id} isArabic={isArabic} />

        <div className="listing-post-create-actions">
          <a className="button-primary" href={`/${locale}/sell/manage`}>
            {isArabic ? 'إدارة إعلاناتي' : 'Manage my listings'}
          </a>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setCreated(null)}
          >
            {isArabic ? 'نشر إعلان آخر' : 'Create another listing'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form-grid listing-form" onSubmit={handleSubmit}>
      <label>
        {isArabic ? 'العنوان' : 'Title'}
        <input
          name="title"
          minLength={3}
          maxLength={120}
          required
          placeholder={isArabic ? 'مثال: هاتف جديد' : 'Example: New phone'}
        />
      </label>

      <label>
        {isArabic ? 'الوصف' : 'Description'}
        <textarea
          name="description"
          rows={6}
          minLength={10}
          maxLength={5000}
          required
          placeholder={isArabic ? 'اكتب حالة المنتج وتفاصيله' : 'Describe the item, its condition, and important details'}
        />
      </label>

      <div className="form-row">
        <label>
          {isArabic ? 'السعر' : 'Price'}
          <input name="priceAmount" type="number" min="0" step="0.01" required placeholder="0.00" />
        </label>
        <label>
          {isArabic ? 'العملة' : 'Currency'}
          <input name="currencyCode" defaultValue="AUD" minLength={3} maxLength={3} required />
        </label>
      </div>

      <div className="form-row">
        <label>
          {isArabic ? 'الحالة' : 'Condition'}
          <select name="condition" defaultValue="good" required>
            <option value="new">{isArabic ? 'جديد' : 'New'}</option>
            <option value="like_new">{isArabic ? 'كالجديد' : 'Like new'}</option>
            <option value="good">{isArabic ? 'جيد' : 'Good'}</option>
            <option value="fair">{isArabic ? 'مقبول' : 'Fair'}</option>
            <option value="parts_or_repair">{isArabic ? 'للقطع أو الإصلاح' : 'Parts or repair'}</option>
          </select>
        </label>
        <label>
          {isArabic ? 'الدولة' : 'Country'}
          <input name="countryCode" defaultValue="AU" minLength={2} maxLength={2} required />
        </label>
      </div>

      <div className="form-row">
        <label>
          {isArabic ? 'الولاية أو المنطقة' : 'State or region'}
          <input name="region" maxLength={120} placeholder={isArabic ? 'نيو ساوث ويلز' : 'NSW'} />
        </label>
        <label>
          {isArabic ? 'المدينة' : 'City'}
          <input name="city" maxLength={120} placeholder={isArabic ? 'سيدني' : 'Sydney'} />
        </label>
      </div>

      <label>
        {isArabic ? 'الحي' : 'Suburb'}
        <input name="suburb" maxLength={120} placeholder={isArabic ? 'جريناكر' : 'Greenacre'} />
      </label>

      <fieldset className="delivery-options">
        <legend>{isArabic ? 'خيارات التسليم' : 'Fulfilment options'}</legend>
        <label className="checkbox-label">
          <input name="allowPickup" type="checkbox" defaultChecked />
          {isArabic ? 'الاستلام متاح' : 'Pickup available'}
        </label>
        <label className="checkbox-label">
          <input name="allowDelivery" type="checkbox" />
          {isArabic ? 'التوصيل متاح' : 'Delivery available'}
        </label>
      </fieldset>

      {challengeEnabled && siteKey && challengeAction ? (
        <>
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
        </>
      ) : null}

      {!configuration ? (
        <p className="auth-status" aria-live="polite">
          {isArabic ? 'جارٍ تحميل إعدادات الأمان…' : 'Loading security settings…'}
        </p>
      ) : null}

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <button
        className="button-primary"
        type="submit"
        disabled={!configurationReady || !challengeReady || submitting}
      >
        {submitting
          ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…')
          : (isArabic ? 'حفظ كمسودة' : 'Save as draft')}
      </button>
    </form>
  );
}
