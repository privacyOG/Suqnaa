'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import { getPublicCategories, type CategorySummary } from '../lib/category-api';
import {
  getSellerListingForEdit,
  updateSellerListingDetails,
  type EditableSellerListing,
  type ListingAvailabilityStatus,
  type ListingCondition
} from '../lib/listing-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export interface EditListingFormProps {
  locale: string;
  listingId: string;
}

function nullableText(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? '').trim();
  return value.length > 0 ? value : null;
}

function categoryLabel(category: CategorySummary, isArabic: boolean): string {
  return isArabic ? category.nameAr ?? category.nameEn : category.nameEn;
}

function errorMessage(error: unknown, isArabic: boolean): string {
  if (error instanceof AuthedRequestError) {
    if (error.status === 401) {
      return isArabic ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.' : 'Your account session ended. Sign in again.';
    }
    if (error.status === 404) {
      return isArabic ? 'لم يتم العثور على الإعلان في حسابك.' : 'The listing was not found in your account.';
    }
    if (error.status === 409) {
      return isArabic
        ? 'تغيّر الإعلان منذ فتح هذه الصفحة. أعد تحميل أحدث نسخة قبل الحفظ.'
        : 'This listing changed after you opened the form. Reload the latest version before saving.';
    }
    if (error.status === 429) {
      return isArabic ? 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' : 'Too many attempts. Try again later.';
    }
    if (error.payload.requiresHumanCheck) {
      return isArabic ? 'أكمل الفحص الأمني مرة أخرى.' : 'Complete the security check again.';
    }
  }
  return isArabic ? 'تعذر حفظ التغييرات.' : 'The changes could not be saved.';
}

export function EditListingForm({ locale, listingId }: EditListingFormProps) {
  const isArabic = locale === 'ar';
  const [listing, setListing] = useState<EditableSellerListing | null>(null);
  const [editable, setEditable] = useState(false);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const challengeEnabled = configuration?.enabled === true;
  const challengeAction = configuration?.actions.listingEdit;
  const siteKey = configuration?.siteKey ?? null;
  const challengeReady = !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);

  async function loadLatest() {
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const [snapshot, challenge] = await Promise.all([
        getSellerListingForEdit(listingId),
        getChallengeConfiguration()
      ]);
      setListing(snapshot.listing);
      setEditable(snapshot.editable);
      setConfiguration(challenge);
    } catch (caught) {
      setError(errorMessage(caught, isArabic));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLatest();
    getPublicCategories().then(setCategories).catch(() => setCategories([]));
    // listingId/locale identify a new edit surface; loadLatest is intentionally recreated per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, locale]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing || !editable || saving || !configuration || !challengeReady) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const priceAmount = Number(form.get('priceAmount'));
    const quantityText = String(form.get('availableQuantity') ?? '').trim();
    const availableQuantity = quantityText.length > 0 ? Number(quantityText) : null;
    const allowPickup = form.get('allowPickup') === 'on';
    const allowDelivery = form.get('allowDelivery') === 'on';

    if (!Number.isFinite(priceAmount) || priceAmount < 0) {
      setError(isArabic ? 'أدخل سعراً صحيحاً.' : 'Enter a valid price.');
      return;
    }
    if (availableQuantity !== null && (!Number.isInteger(availableQuantity) || availableQuantity < 0 || availableQuantity > 1000000)) {
      setError(isArabic ? 'أدخل كمية صحيحة.' : 'Enter a valid available quantity.');
      return;
    }
    if (!allowPickup && !allowDelivery) {
      setError(isArabic ? 'اختر الاستلام أو التوصيل على الأقل.' : 'Select pickup or delivery.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const response = await updateSellerListingDetails(
        listing.id,
        {
          version: listing.version,
          categoryId: nullableText(form, 'categoryId'),
          title: String(form.get('title') ?? '').trim(),
          description: String(form.get('description') ?? '').trim(),
          priceAmount,
          currencyCode: String(form.get('currencyCode') ?? '').trim().toUpperCase(),
          condition: String(form.get('condition') ?? 'good') as ListingCondition,
          availabilityStatus: String(form.get('availabilityStatus') ?? 'in_stock') as ListingAvailabilityStatus,
          availableQuantity,
          unitLabel: nullableText(form, 'unitLabel'),
          countryCode: String(form.get('countryCode') ?? '').trim().toUpperCase(),
          region: nullableText(form, 'region'),
          city: nullableText(form, 'city'),
          suburb: nullableText(form, 'suburb'),
          allowPickup,
          allowDelivery
        },
        challengeToken ?? undefined
      );
      setListing(response.listing);
      setEditable(['draft', 'active', 'expired'].includes(response.listing.status));
      setSaved(response.unchanged
        ? (isArabic ? 'لا توجد تغييرات جديدة للحفظ.' : 'No new changes to save.')
        : (isArabic ? 'تم حفظ التغييرات.' : 'Listing changes saved.'));
    } catch (caught) {
      setError(errorMessage(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setSaving(false);
    }
  }

  if (loading && !listing) {
    return <p className="auth-status">{isArabic ? 'جارٍ تحميل الإعلان…' : 'Loading listing…'}</p>;
  }

  if (!listing) {
    return (
      <section className="seller-session-panel">
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button-secondary" type="button" onClick={() => void loadLatest()}>
          {isArabic ? 'إعادة المحاولة' : 'Try again'}
        </button>
      </section>
    );
  }

  return (
    <section className="seller-dashboard">
      <div className="seller-dashboard-toolbar">
        <div>
          <strong>{isArabic ? 'تعديل الإعلان' : 'Edit listing'}</strong>
          <span>{isArabic ? `النسخة ${listing.version}` : `Version ${listing.version}`}</span>
        </div>
        <span className={`listing-status listing-status-${listing.status}`}>{listing.status}</span>
      </div>

      {!editable ? (
        <p className="auth-error" role="alert">
          {isArabic
            ? 'لا يمكن تعديل هذا الإعلان في حالته الحالية. الإعلانات المحجوزة أو المباعة أو المحذوفة محمية من تغيير التفاصيل.'
            : 'This listing cannot be edited in its current state. Reserved, sold, and removed listings are protected from detail changes.'}
        </p>
      ) : null}
      {error ? (
        <div className="seller-session-panel">
          <p className="auth-error" role="alert">{error}</p>
          <button className="button-secondary" type="button" disabled={loading || saving} onClick={() => void loadLatest()}>
            {isArabic ? 'تحميل أحدث نسخة' : 'Reload latest version'}
          </button>
        </div>
      ) : null}
      {saved ? <p className="auth-status" role="status">{saved}</p> : null}

      <form key={`${listing.id}:${listing.version}`} className="form-grid listing-form" onSubmit={submit}>
        <label>
          {isArabic ? 'الفئة' : 'Category'}
          <select name="categoryId" defaultValue={listing.categoryId ?? ''} disabled={!editable || saving}>
            <option value="">{isArabic ? 'أخرى / غير محدد' : 'Other / not specified'}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{categoryLabel(category, isArabic)}</option>
            ))}
          </select>
        </label>

        <label>
          {isArabic ? 'العنوان' : 'Title'}
          <input name="title" minLength={3} maxLength={120} required defaultValue={listing.title} disabled={!editable || saving} />
        </label>

        <label>
          {isArabic ? 'الوصف' : 'Description'}
          <textarea name="description" rows={7} minLength={10} maxLength={5000} required defaultValue={listing.description} disabled={!editable || saving} />
        </label>

        <div className="form-row">
          <label>
            {isArabic ? 'السعر' : 'Price'}
            <input name="priceAmount" type="number" min="0" step="0.01" required defaultValue={Number(listing.priceAmount)} disabled={!editable || saving} />
          </label>
          <label>
            {isArabic ? 'العملة' : 'Currency'}
            <input name="currencyCode" minLength={3} maxLength={3} required defaultValue={listing.currencyCode} disabled={!editable || saving} />
          </label>
        </div>

        <div className="form-row">
          <label>
            {isArabic ? 'حالة المنتج' : 'Condition'}
            <select name="condition" defaultValue={listing.condition} disabled={!editable || saving}>
              <option value="new">{isArabic ? 'جديد' : 'New'}</option>
              <option value="like_new">{isArabic ? 'كالجديد' : 'Like new'}</option>
              <option value="good">{isArabic ? 'جيد' : 'Good'}</option>
              <option value="fair">{isArabic ? 'مقبول' : 'Fair'}</option>
              <option value="parts_or_repair">{isArabic ? 'للقطع أو الإصلاح' : 'Parts or repair'}</option>
            </select>
          </label>
          <label>
            {isArabic ? 'التوفر' : 'Availability'}
            <select name="availabilityStatus" defaultValue={listing.availabilityStatus} disabled={!editable || saving}>
              <option value="in_stock">{isArabic ? 'متوفر' : 'In stock'}</option>
              <option value="limited">{isArabic ? 'كمية محدودة' : 'Limited'}</option>
              <option value="out_of_stock">{isArabic ? 'غير متوفر' : 'Out of stock'}</option>
              <option value="service_available">{isArabic ? 'خدمة متاحة' : 'Service available'}</option>
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>
            {isArabic ? 'الكمية المتاحة' : 'Available quantity'}
            <input name="availableQuantity" type="number" min="0" max="1000000" step="1" defaultValue={listing.availableQuantity ?? ''} disabled={!editable || saving} />
          </label>
          <label>
            {isArabic ? 'اسم الوحدة' : 'Unit label'}
            <input name="unitLabel" maxLength={40} defaultValue={listing.unitLabel ?? ''} placeholder={isArabic ? 'مثال: قطعة' : 'Example: item'} disabled={!editable || saving} />
          </label>
        </div>

        <div className="form-row">
          <label>
            {isArabic ? 'الدولة' : 'Country'}
            <input name="countryCode" minLength={2} maxLength={2} required defaultValue={listing.countryCode} disabled={!editable || saving} />
          </label>
          <label>
            {isArabic ? 'الولاية / المنطقة' : 'State / region'}
            <input name="region" maxLength={120} defaultValue={listing.region ?? ''} disabled={!editable || saving} />
          </label>
        </div>

        <div className="form-row">
          <label>
            {isArabic ? 'المدينة' : 'City'}
            <input name="city" maxLength={120} defaultValue={listing.city ?? ''} disabled={!editable || saving} />
          </label>
          <label>
            {isArabic ? 'الضاحية' : 'Suburb'}
            <input name="suburb" maxLength={120} defaultValue={listing.suburb ?? ''} disabled={!editable || saving} />
          </label>
        </div>

        <label className="checkbox-row">
          <input name="allowPickup" type="checkbox" defaultChecked={listing.allowPickup} disabled={!editable || saving} />
          <span>{isArabic ? 'السماح بالاستلام المحلي' : 'Allow local pickup'}</span>
        </label>
        <label className="checkbox-row">
          <input name="allowDelivery" type="checkbox" defaultChecked={listing.allowDelivery} disabled={!editable || saving} />
          <span>{isArabic ? 'السماح بالتوصيل / الشحن' : 'Allow delivery / shipping'}</span>
        </label>

        {challengeEnabled && siteKey && challengeAction && editable ? (
          <div className="seller-security-check">
            <p>{isArabic ? 'أكمل الفحص الأمني قبل حفظ التغييرات.' : 'Complete the security check before saving changes.'}</p>
            <ChallengeProviderScript />
            <ChallengeWidget
              siteKey={siteKey}
              action={challengeAction}
              locale={locale}
              resetKey={resetKey}
              onToken={setChallengeToken}
              onExpired={() => setChallengeToken(null)}
              onError={() => setChallengeToken(null)}
            />
          </div>
        ) : null}

        <div className="actions">
          <button className="button-primary" type="submit" disabled={!editable || saving || !configuration || !challengeReady}>
            {saving ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (isArabic ? 'حفظ التغييرات' : 'Save changes')}
          </button>
          <a className="button-secondary" href={`/${locale}/sell/manage`}>{isArabic ? 'العودة إلى إعلاناتي' : 'Back to my listings'}</a>
          <a className="button-secondary" href={`/${locale}/sell/media`}>{isArabic ? 'إدارة الصور' : 'Manage photos'}</a>
        </div>
      </form>
    </section>
  );
}
