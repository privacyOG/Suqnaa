'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import { getChallengeConfiguration, type ChallengeConfiguration } from '../lib/challenge-api';
import {
  beginSellerVerification,
  loadSellerVerificationStatus,
  type SellerVerificationCheck,
  type SellerVerificationStatusPayload
} from '../lib/seller-verification-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === 'ar' ? 'ar' : 'en-AU');
}

function statusText(check: SellerVerificationCheck | null, isArabic: boolean): string {
  if (!check) return isArabic ? 'لم يبدأ التحقق بعد.' : 'Verification has not been started.';
  if (check.status === 'verified') return isArabic ? 'تم التحقق من البائع.' : 'Seller verification is current.';
  if (check.status === 'rejected') return isArabic ? 'لم تتم الموافقة على آخر تحقق.' : 'The latest verification was not approved.';
  if (check.status === 'expired') return isArabic ? 'انتهت صلاحية التحقق ويلزم إعادة التحقق.' : 'Verification expired and must be renewed.';
  if (check.providerResult === 'pending') return isArabic ? 'جلسة التحقق لم تكتمل بعد.' : 'The hosted verification session is still in progress.';
  return isArabic ? 'اكتمل الفحص وينتظر مراجعة العمليات.' : 'The provider check is complete and awaiting operations review.';
}

export function SellerVerificationPanel({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [payload, setPayload] = useState<SellerVerificationStatusPayload | null>(null);
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [countryCode, setCountryCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadSellerVerificationStatus(), getChallengeConfiguration()])
      .then(([verification, challenge]) => {
        if (!active) return;
        setPayload(verification);
        setConfiguration(challenge);
        setCountryCode(verification.verification.profile.countryCode ?? '');
      })
      .catch(() => {
        if (active) setError(isArabic ? 'تعذر تحميل حالة التحقق.' : 'Verification status could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isArabic]);

  const verification = payload?.verification;
  const current = verification?.current ?? null;
  const challengeEnabled = configuration?.enabled === true;
  const challengeAction = configuration?.actions.accountSellerVerificationStart;
  const siteKey = configuration?.siteKey ?? null;
  const challengeReady = !challengeEnabled || Boolean(challengeToken && challengeAction && siteKey);
  const waitingReview = current?.status === 'pending' && current.providerResult !== 'pending';
  const currentVerified = current?.status === 'verified';
  const canStart = Boolean(verification?.providerEnabled) && !waitingReview && !currentVerified;

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verification || !canStart || !challengeReady || busy) return;
    const country = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      setError(isArabic ? 'أدخل رمز دولة من حرفين.' : 'Enter a two-letter country code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await beginSellerVerification({
        level: verification.eligibleLevel,
        countryCode: country
      }, challengeToken ?? undefined);
      const target = new URL(response.session.hostedUrl);
      if (target.protocol !== 'https:') throw new Error('Insecure verification URL');
      window.location.assign(target.toString());
    } catch (caught) {
      if (caught instanceof AuthedRequestError) {
        if (caught.status === 403) {
          setError(isArabic ? 'أكمل فحص الأمان ثم حاول مجدداً.' : 'Complete the security check and try again.');
        } else if (caught.status === 429) {
          setError(isArabic ? 'طلبات كثيرة. حاول لاحقاً.' : 'Too many verification requests. Try again later.');
        } else if (caught.status === 503) {
          setError(isArabic ? 'خدمة التحقق غير متاحة حالياً.' : 'Verification service is temporarily unavailable.');
        } else {
          setError(isArabic ? 'تعذر بدء التحقق.' : 'Verification could not be started.');
        }
      } else {
        setError(isArabic ? 'تعذر فتح جلسة التحقق.' : 'The verification session could not be opened.');
      }
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setBusy(false);
    }
  }

  if (loading) return <p className="auth-status">{isArabic ? 'جارٍ تحميل التحقق…' : 'Loading verification…'}</p>;
  if (!verification) return <p className="auth-error">{error ?? (isArabic ? 'حالة التحقق غير متاحة.' : 'Verification status is unavailable.')}</p>;

  const incompleteBusiness = verification.eligibleLevel === 'business' && !verification.profile.businessName;

  return (
    <div className="form-grid">
      <section className="value-card">
        <h2>{isArabic ? 'حالة التحقق' : 'Verification status'}</h2>
        <p className="auth-status" role="status">{statusText(current, isArabic)}</p>
        <p><strong>{isArabic ? 'المستوى' : 'Level'}:</strong> {verification.eligibleLevel === 'business' ? (isArabic ? 'نشاط تجاري' : 'Business') : (isArabic ? 'بائع فردي' : 'Individual seller')}</p>
        {current ? (
          <>
            <p><strong>{isArabic ? 'الدولة' : 'Country'}:</strong> {current.countryCode ?? '—'}</p>
            <p><strong>{isArabic ? 'تاريخ التقديم' : 'Submitted'}:</strong> {formatDate(current.submittedAt, locale)}</p>
            {current.verifiedAt ? <p><strong>{isArabic ? 'تم التحقق' : 'Verified'}:</strong> {formatDate(current.verifiedAt, locale)}</p> : null}
            {current.expiresAt ? <p><strong>{isArabic ? 'تنتهي الصلاحية' : 'Expires'}:</strong> {formatDate(current.expiresAt, locale)}</p> : null}
            {current.reasonCode ? <p><strong>{isArabic ? 'الحالة' : 'Status detail'}:</strong> {current.reasonCode.replaceAll('_', ' ')}</p> : null}
          </>
        ) : null}
      </section>

      <section className="value-card">
        <h2>{isArabic ? 'بدء التحقق أو متابعته' : 'Start or continue verification'}</h2>
        <p>
          {isArabic
            ? 'تتم الخطوات الحساسة داخل الجلسة المستضافة لخدمة التحقق، وليس داخل نموذج الملف الشخصي.'
            : 'Sensitive verification steps are completed inside the hosted verification session rather than the marketplace profile form.'}
        </p>
        {!verification.providerEnabled ? (
          <p className="auth-error">{isArabic ? 'خدمة التحقق غير مفعّلة حالياً.' : 'Seller verification is not enabled in this deployment.'}</p>
        ) : null}
        {incompleteBusiness ? (
          <p className="auth-error">{isArabic ? 'أضف اسم النشاط التجاري في ملفك أولاً.' : 'Add your business name to your profile before starting business verification.'}</p>
        ) : null}
        <form className="form-grid" onSubmit={start}>
          <label>
            {isArabic ? 'رمز الدولة' : 'Country code'}
            <input
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
              maxLength={2}
              pattern="[A-Za-z]{2}"
              placeholder="AU"
              required
              disabled={!canStart || incompleteBusiness}
            />
            <span className="field-help">{isArabic ? 'رمز ISO من حرفين؛ لا يتم افتراض دولة.' : 'Two-letter ISO code; no country is inferred.'}</span>
          </label>

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
                onError={() => setChallengeToken(null)}
              />
            </>
          ) : null}

          <button className="button-primary" type="submit" disabled={!canStart || incompleteBusiness || !challengeReady || busy}>
            {busy
              ? (isArabic ? 'جارٍ الفتح…' : 'Opening…')
              : current?.status === 'pending' && current.providerResult === 'pending'
                ? (isArabic ? 'متابعة جلسة التحقق' : 'Continue hosted verification')
                : (isArabic ? 'بدء التحقق' : 'Start verification')}
          </button>
        </form>
      </section>

      <section className="value-card">
        <h2>{isArabic ? 'الخصوصية والمراجعة' : 'Privacy and review'}</h2>
        <p>
          {isArabic
            ? 'تحتفظ سوقنا بحالة التحقق والمرجع وبيانات تدقيق محدودة. نتيجة الخدمة لا تجعل الحساب موثقاً تلقائياً؛ القرار النهائي يحتاج مراجعة العمليات.'
            : 'Suqnaa retains verification state, the provider reference, and limited audit metadata. A provider result never verifies the account automatically; final approval requires operations review.'}
        </p>
        <a className="button-secondary" href={`/${locale}/account/profile`}>
          {isArabic ? 'تحديث الملف التجاري' : 'Update business profile'}
        </a>
      </section>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
