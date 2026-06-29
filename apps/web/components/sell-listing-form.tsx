'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getPublicCategories,
  type CategorySummary
} from '../lib/category-api';
import {
  createListingDraft,
  uploadListingMedia,
  type ListingAvailabilityStatus,
  type ListingCondition
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

const allowedPhotoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumPhotoBytes = 4 * 1024 * 1024;
const maximumPhotoCount = 8;

interface CreatedListingState {
  title: string;
  photoCount: number;
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
    if (caught.status === 413) {
      return isArabic
        ? 'حجم الصورة كبير جداً. استخدم صورة أصغر.'
        : 'A photo is too large. Use a smaller image.';
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
        ? 'تحقق من بيانات الإعلان والصور ثم أعد الإرسال.'
        : 'Check the listing details and photos, then submit again.';
    }
  }

  return isArabic
    ? 'تعذر حفظ الإعلان حالياً. حاول مرة أخرى.'
    : 'The listing could not be saved right now. Please try again.';
}

function validatePhotos(files: File[], isArabic: boolean): string | null {
  if (files.length > maximumPhotoCount) {
    return isArabic
      ? `يمكنك رفع ${maximumPhotoCount} صور كحد أقصى.`
      : `Upload up to ${maximumPhotoCount} photos.`;
  }

  for (const file of files) {
    if (!allowedPhotoTypes.has(file.type)) {
      return isArabic
        ? 'استخدم صور JPG أو PNG أو WebP فقط.'
        : 'Use JPG, PNG, or WebP photos only.';
    }
    if (file.size > maximumPhotoBytes) {
      return isArabic
        ? 'يجب ألا يتجاوز حجم كل صورة 4 ميجابايت.'
        : 'Each photo must be 4 MB or smaller.';
    }
  }

  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to read photo'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read photo'));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    image.src = url;
  });
}

function categoryLabel(category: CategorySummary, isArabic: boolean): string {
  return isArabic ? category.nameAr ?? category.nameEn : category.nameEn;
}

export function SellListingForm({ locale }: SellListingFormProps) {
  const isArabic = locale === 'ar';
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedListingState | null>(null);

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

  useEffect(() => {
    let active = true;

    getPublicCategories()
      .then((value) => {
        if (active) {
          setCategories(value);
        }
      })
      .catch(() => {
        if (active) {
          setCategoriesError(true);
        }
      })
      .finally(() => {
        if (active) {
          setCategoriesLoading(false);
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
    const categoryId = String(form.get('categoryId') ?? '').trim();
    const priceAmount = Number(form.get('priceAmount'));
    const currencyCode = String(form.get('currencyCode') ?? '').trim().toUpperCase();
    const countryCode = String(form.get('countryCode') ?? '').trim().toUpperCase();
    const allowPickup = form.get('allowPickup') === 'on';
    const allowDelivery = form.get('allowDelivery') === 'on';
    const availabilityStatus = String(form.get('availabilityStatus') ?? 'in_stock') as ListingAvailabilityStatus;
    const quantityValue = String(form.get('availableQuantity') ?? '').trim();
    const availableQuantity = quantityValue ? Number(quantityValue) : undefined;
    const unitLabel = String(form.get('unitLabel') ?? '').trim() || undefined;
    const photos = form.getAll('photos')
      .filter((value): value is File => value instanceof File && value.size > 0);

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
    if (availableQuantity !== undefined && (!Number.isInteger(availableQuantity) || availableQuantity < 0)) {
      setError(isArabic ? 'أدخل كمية صحيحة.' : 'Enter a valid available quantity.');
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

    const photoError = validatePhotos(photos, isArabic);
    if (photoError) {
      setError(photoError);
      return;
    }

    setSubmitting(true);
    setUploadStatus(null);
    setError(null);
    setCreated(null);

    try {
      const response = await createListingDraft(
        {
          categoryId: categoryId || undefined,
          title: String(form.get('title') ?? '').trim(),
          description: String(form.get('description') ?? '').trim(),
          priceAmount,
          currencyCode,
          condition: String(form.get('condition') ?? 'good') as ListingCondition,
          availabilityStatus,
          availableQuantity,
          unitLabel,
          countryCode,
          region: String(form.get('region') ?? '').trim() || undefined,
          city: String(form.get('city') ?? '').trim() || undefined,
          suburb: String(form.get('suburb') ?? '').trim() || undefined,
          allowPickup,
          allowDelivery
        },
        challengeToken ?? undefined
      );

      let uploadedPhotos = 0;
      for (const [index, photo] of photos.entries()) {
        setUploadStatus(
          isArabic
            ? `جارٍ رفع الصورة ${index + 1} من ${photos.length}…`
            : `Uploading photo ${index + 1} of ${photos.length}…`
        );
        const [base64Data, dimensions] = await Promise.all([
          fileToBase64(photo),
          imageDimensions(photo)
        ]);
        await uploadListingMedia(response.listing.id, {
          fileName: photo.name,
          mimeType: photo.type as 'image/jpeg' | 'image/png' | 'image/webp',
          sizeBytes: photo.size,
          base64Data,
          width: dimensions.width || undefined,
          height: dimensions.height || undefined,
          altText: String(form.get('title') ?? '').trim(),
          sortOrder: index
        });
        uploadedPhotos += 1;
      }

      setCreated({ title: response.listing.title, photoCount: uploadedPhotos });
      setUploadStatus(null);
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

  return (
    <form className="form-grid listing-form" onSubmit={handleSubmit}>
      <label>
        {isArabic ? 'الفئة' : 'Category'}
        <select name="categoryId" disabled={categoriesLoading || categories.length === 0} defaultValue="">
          <option value="">
            {categoriesLoading
              ? (isArabic ? 'جارٍ تحميل الفئات…' : 'Loading categories…')
              : (isArabic ? 'أخرى / غير محدد' : 'Other / not sure')}
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryLabel(category, isArabic)}
            </option>
          ))}
        </select>
      </label>

      {categoriesError ? (
        <p className="auth-status" aria-live="polite">
          {isArabic
            ? 'تعذر تحميل الفئات. يمكنك حفظ الإعلان بدون فئة حالياً.'
            : 'Categories could not be loaded. You can save the listing without a category for now.'}
        </p>
      ) : null}

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

      <div className="photo-upload-panel">
        <label>
          {isArabic ? 'صور الإعلان' : 'Listing photos'}
          <input
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
          />
        </label>
        <p>
          {isArabic
            ? 'ارفع حتى 8 صور. JPG أو PNG أو WebP، بحد أقصى 4 ميجابايت لكل صورة.'
            : 'Upload up to 8 photos. JPG, PNG, or WebP, maximum 4 MB each.'}
        </p>
      </div>

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
          {isArabic ? 'التوفر' : 'Availability'}
          <select name="availabilityStatus" defaultValue="in_stock" required>
            <option value="in_stock">{isArabic ? 'متوفر' : 'In stock'}</option>
            <option value="limited">{isArabic ? 'كمية محدودة' : 'Limited stock'}</option>
            <option value="out_of_stock">{isArabic ? 'غير متوفر حالياً' : 'Out of stock'}</option>
            <option value="service_available">{isArabic ? 'خدمة متاحة' : 'Service available'}</option>
          </select>
        </label>
        <label>
          {isArabic ? 'الكمية المتاحة' : 'Available quantity'}
          <input name="availableQuantity" type="number" min="0" step="1" defaultValue="1" />
        </label>
      </div>

      <label>
        {isArabic ? 'وحدة الكمية' : 'Unit label'}
        <input name="unitLabel" maxLength={40} defaultValue="item" placeholder={isArabic ? 'قطعة، ساعة، خدمة' : 'item, hour, service'} />
      </label>

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

      {uploadStatus ? <p className="auth-status" aria-live="polite">{uploadStatus}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {created ? (
        <div className="listing-success" role="status">
          <strong>{isArabic ? 'تم حفظ المسودة' : 'Draft saved'}</strong>
          <span>{created.title}</span>
          <small>
            {created.photoCount > 0
              ? (isArabic ? `${created.photoCount} صور محفوظة` : `${created.photoCount} photo${created.photoCount === 1 ? '' : 's'} uploaded`)
              : (isArabic ? 'لم تُرفع صور بعد' : 'No photos uploaded yet')}
          </small>
          <a href={`/${locale}/sell/manage`}>
            {isArabic ? 'إدارة إعلاناتي' : 'Manage my listings'}
          </a>
        </div>
      ) : null}

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
