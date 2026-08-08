'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import { getChallengeConfiguration, type ChallengeConfiguration } from '../lib/challenge-api';
import {
  getSellerListingLocation,
  updateSellerListingLocation,
  type SellerListingLocationSnapshot
} from '../lib/listing-location-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export function ListingLocationForm({ locale, listingId }: { locale: string; listingId: string }) {
  const isArabic = locale === 'ar';
  const [snapshot, setSnapshot] = useState<SellerListingLocationSnapshot | null>(null);
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const challengeEnabled = configuration?.enabled === true;
  const challengeAction = configuration?.actions.listingEdit;
  const siteKey = configuration?.siteKey ?? null;
  const challengeReady = !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);

  async function loadLatest() {
    setLoading(true);
    setError(null);
    try {
      const [listing, challenge] = await Promise.all([
        getSellerListingLocation(listingId),
        getChallengeConfiguration()
      ]);
      setSnapshot(listing);
      setConfiguration(challenge);
    } catch (caught) {
      setError(caught instanceof AuthedRequestError && caught.status === 404
        ? (isArabic ? 'لم يتم العثور على الإعلان في حسابك.' : 'The listing was not found in your account.')
        : (isArabic ? 'تعذر تحميل الموقع التقريبي.' : 'Unable to load the approximate location.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLatest();
    // The listing identifier and locale define this owner-only editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, locale]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || !snapshot.editable || !configuration || !challengeReady || saving) return;

    const form = new FormData(event.currentTarget);
    const latitudeText = String(form.get('latitude') ?? '').trim();
    const longitudeText = String(form.get('longitude') ?? '').trim();
    const wantsLocation = latitudeText.length > 0 || longitudeText.length > 0;
    if (wantsLocation && (!latitudeText || !longitudeText)) {
      setError(isArabic ? 'أدخل خط العرض وخط الطول معاً.' : 'Enter both latitude and longitude.');
      return;
    }
    const latitude = latitudeText ? Number(latitudeText) : null;
    const longitude = longitudeText ? Number(longitudeText) : null;
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      setError(isArabic ? 'خط العرض غير صالح.' : 'Latitude is invalid.');
      return;
    }
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      setError(isArabic ? 'خط الطول غير صالح.' : 'Longitude is invalid.');
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await updateSellerListingLocation(
        listingId,
        {
          version: snapshot.version,
          approximateLocation: latitude === null || longitude === null
            ? null
            : { latitude, longitude }
        },
        challengeToken ?? undefined
      );
      setSnapshot(response.listing);
      setStatus(response.unchanged
        ? (isArabic ? 'لا يوجد تغيير جديد.' : 'No location change to save.')
        : (isArabic ? 'تم حفظ الموقع التقريبي.' : 'Approximate location saved.'));
    } catch (caught) {
      if (caught instanceof AuthedRequestError && caught.status === 409) {
        setError(isArabic
          ? 'تغيّر الإعلان. حمّل أحدث نسخة قبل حفظ الموقع.'
          : 'The listing changed. Reload the latest version before saving location.');
      } else {
        setError(isArabic ? 'تعذر حفظ الموقع التقريبي.' : 'Unable to save the approximate location.');
      }
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setSaving(false);
    }
  }

  if (loading && !snapshot) {
    return <p className="auth-status">{isArabic ? 'جارٍ تحميل موقع الإعلان…' : 'Loading listing location…'}</p>;
  }

  return (
    <section className="seller-session-panel">
      <h2>{isArabic ? 'الموقع التقريبي للبحث القريب' : 'Approximate location for nearby search'}</h2>
      <p>
        {isArabic
          ? 'يتم تقريب الإحداثيات إلى شبكة 0.01 درجة قبل الحفظ. لا تُعرض إحداثيات إعلانك علناً؛ يرى المشترون مسافة تقريبية بالكيلومترات فقط.'
          : 'Coordinates are rounded to a 0.01° grid before storage. Your listing coordinates are never published; buyers see only a coarse distance in kilometres.'}
      </p>
      {snapshot ? <p className="auth-status">{isArabic ? `نسخة الإعلان ${snapshot.version}` : `Listing version ${snapshot.version}`}</p> : null}
      {snapshot && !snapshot.editable ? <p className="auth-error">{isArabic ? 'لا يمكن تعديل الموقع في حالة الإعلان الحالية.' : 'Location cannot be edited in the listing’s current state.'}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {status ? <p className="auth-status" role="status">{status}</p> : null}
      {snapshot ? (
        <form key={`${snapshot.listingId}:${snapshot.version}`} className="form-grid" onSubmit={submit}>
          <div className="form-row">
            <label>
              {isArabic ? 'خط العرض التقريبي' : 'Approximate latitude'}
              <input name="latitude" type="number" min="-90" max="90" step="0.01" defaultValue={snapshot.approximateLocation?.latitude ?? ''} disabled={!snapshot.editable || saving} placeholder="-33.87" />
            </label>
            <label>
              {isArabic ? 'خط الطول التقريبي' : 'Approximate longitude'}
              <input name="longitude" type="number" min="-180" max="180" step="0.01" defaultValue={snapshot.approximateLocation?.longitude ?? ''} disabled={!snapshot.editable || saving} placeholder="151.21" />
            </label>
          </div>
          <small>{isArabic ? 'اترك الحقلين فارغين لإزالة الموقع من البحث القريب.' : 'Leave both fields blank to remove the listing from nearby search.'}</small>
          {challengeEnabled && siteKey && challengeAction && snapshot.editable ? (
            <>
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
            </>
          ) : null}
          <div className="actions">
            <button className="button-primary" type="submit" disabled={!snapshot.editable || saving || !challengeReady}>
              {saving ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (isArabic ? 'حفظ الموقع التقريبي' : 'Save approximate location')}
            </button>
            <button className="button-secondary" type="button" onClick={() => void loadLatest()} disabled={loading || saving}>
              {isArabic ? 'تحميل أحدث نسخة' : 'Reload latest'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
