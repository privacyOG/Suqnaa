'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiRequestError,
  login,
  register,
  type AuthPayload
} from '../lib/account-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export interface AccountAuthFormProps {
  locale: string;
  mode: 'login' | 'register';
}

async function establishSession(payload: AuthPayload): Promise<void> {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessToken: payload.accessToken,
      refreshToken: payload.session.refreshToken
    })
  });

  if (!response.ok) {
    throw new Error('Unable to establish web session');
  }
}

export function AccountAuthForm({ locale, mode }: AccountAuthFormProps) {
  const router = useRouter();
  const isArabic = locale === 'ar';
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const challengeAction = mode === 'login'
    ? configuration?.actions.accountLogin
    : configuration?.actions.accountRegister;
  const challengeReady = !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);
  const configurationReady = configuration !== null && !configurationError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configurationReady || !challengeReady || submitting) {
      return;
    }

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);

    try {
      const payload = mode === 'login'
        ? await login(
            {
              email: String(form.get('email') ?? '').trim().toLowerCase(),
              password: String(form.get('password') ?? '')
            },
            challengeToken ?? undefined
          )
        : await register(
            {
              displayName: String(form.get('displayName') ?? '').trim(),
              email: String(form.get('email') ?? '').trim().toLowerCase(),
              password: String(form.get('password') ?? '')
            },
            challengeToken ?? undefined
          );

      await establishSession(payload);
      router.replace(`/${locale}/account`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.payload.requiresHumanCheck) {
        setError(
          isArabic
            ? 'تعذر التحقق من الفحص الأمني. أعد المحاولة.'
            : 'The security check could not be verified. Please try again.'
        );
      } else if (caught instanceof ApiRequestError && caught.status === 401) {
        setError(isArabic ? 'بيانات الدخول غير صحيحة.' : 'Incorrect email or password.');
      } else if (caught instanceof ApiRequestError && caught.status === 409) {
        setError(isArabic ? 'يوجد حساب بهذا البريد بالفعل.' : 'An account already exists for this email.');
      } else {
        setError(
          isArabic
            ? 'تعذر إكمال الطلب. حاول مرة أخرى.'
            : 'The request could not be completed. Please try again.'
        );
      }

      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
    } finally {
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
    <form className="form-grid" onSubmit={handleSubmit}>
      {mode === 'register' ? (
        <label>
          {isArabic ? 'الاسم' : 'Display name'}
          <input
            name="displayName"
            minLength={2}
            maxLength={80}
            autoComplete="name"
            required
            placeholder={isArabic ? 'اسمك' : 'Your name'}
          />
        </label>
      ) : null}

      <label>
        {isArabic ? 'البريد الإلكتروني' : 'Email'}
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </label>

      <label>
        {isArabic ? 'كلمة المرور' : 'Password'}
        <input
          name="password"
          type="password"
          minLength={mode === 'register' ? 10 : 1}
          maxLength={200}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
          placeholder="••••••••••"
        />
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
            onError={() => {
              setChallengeToken(null);
              setError(
                isArabic
                  ? 'تعذر تحميل الفحص الأمني.'
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

      {error ? (
        <p className="auth-error" role="alert">{error}</p>
      ) : null}

      <button
        className="button-primary"
        type="submit"
        disabled={!configurationReady || !challengeReady || submitting}
      >
        {submitting
          ? (isArabic ? 'جارٍ الإرسال…' : 'Submitting…')
          : mode === 'login'
            ? (isArabic ? 'دخول' : 'Sign in')
            : (isArabic ? 'إنشاء الحساب' : 'Create account')}
      </button>
    </form>
  );
}
