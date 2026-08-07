'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import {
  PasswordRecoveryError,
  requestPasswordReset
} from '../lib/password-security-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    getChallengeConfiguration()
      .then((value) => {
        if (active) setConfiguration(value);
      })
      .catch(() => {
        if (active) setConfigurationError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const enabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const action = configuration?.actions.accountPasswordResetRequest;
  const challengeReady = !enabled || Boolean(siteKey && action && challengeToken);
  const configurationReady = configuration !== null && !configurationError;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configurationReady || !challengeReady || busy) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    setBusy(true);
    setError(null);

    try {
      await requestPasswordReset(email, challengeToken ?? undefined);
      setAccepted(true);
    } catch (caught) {
      if (caught instanceof PasswordRecoveryError && caught.status === 429) {
        setError(
          isArabic
            ? `طلبات كثيرة. حاول مجدداً${caught.retryAfter ? ` بعد ${caught.retryAfter} ثانية` : ' لاحقاً'}.`
            : `Too many requests. Try again${caught.retryAfter ? ` in ${caught.retryAfter} seconds` : ' later'}.`
        );
      } else if (caught instanceof PasswordRecoveryError && caught.status === 403) {
        setError(isArabic ? 'تعذر التحقق من الفحص الأمني.' : 'The security check could not be verified.');
      } else {
        setError(isArabic ? 'تعذر إرسال طلب الاستعادة حالياً.' : 'The recovery request could not be submitted right now.');
      }

      if (enabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  if (configurationError) {
    return <p className="auth-error" role="alert">{isArabic ? 'تعذر تحميل إعدادات الأمان.' : 'Unable to load security settings.'}</p>;
  }

  if (accepted) {
    return (
      <div className="form-grid">
        <p className="auth-status" role="status">
          {isArabic
            ? 'إذا كان البريد الإلكتروني مرتبطاً بحساب، فسيتم إرسال تعليمات إعادة تعيين كلمة المرور. لا نؤكد ما إذا كان الحساب موجوداً.'
            : 'If that email is linked to an account, password-reset instructions will be sent. We do not confirm whether an account exists.'}
        </p>
        <a className="button-secondary" href={`/${locale}/account/reset-password`}>
          {isArabic ? 'لدي رمز إعادة التعيين' : 'I have a reset token'}
        </a>
      </div>
    );
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        {isArabic ? 'البريد الإلكتروني' : 'Email'}
        <input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </label>

      {enabled && siteKey && action ? (
        <>
          <ChallengeProviderScript />
          <ChallengeWidget
            siteKey={siteKey}
            action={action}
            locale={locale}
            resetKey={resetKey}
            onToken={setChallengeToken}
            onExpired={() => setChallengeToken(null)}
            onError={() => setChallengeToken(null)}
          />
        </>
      ) : null}

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="button-primary" type="submit" disabled={!configurationReady || !challengeReady || busy}>
        {busy ? (isArabic ? 'جارٍ الإرسال…' : 'Submitting…') : (isArabic ? 'إرسال تعليمات الاستعادة' : 'Send recovery instructions')}
      </button>
    </form>
  );
}
