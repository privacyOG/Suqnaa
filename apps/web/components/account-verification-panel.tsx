'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthedRequestError } from '../lib/authed-api';
import {
  confirmContactVerification,
  getContactVerificationState,
  requestContactVerification,
  type ContactVerificationChannel,
  type ContactVerificationState
} from '../lib/account-verification-api';

function channelLabel(channel: ContactVerificationChannel, isArabic: boolean): string {
  if (channel === 'email') {
    return isArabic ? 'البريد الإلكتروني' : 'Email';
  }
  return isArabic ? 'رقم الهاتف' : 'Phone';
}

function errorMessage(caught: unknown, isArabic: boolean): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.' : 'Your account session ended. Sign in again.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `طلبات كثيرة. حاول مجدداً${caught.retryAfter ? ` بعد ${caught.retryAfter} ثانية` : ' لاحقاً'}.`
        : `Too many requests. Try again${caught.retryAfter ? ` in ${caught.retryAfter} seconds` : ' later'}.`;
    }
    if (caught.status === 410) {
      return isArabic ? 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.' : 'That code expired. Request a new code.';
    }
    if (caught.status === 503) {
      return isArabic ? 'خدمة إرسال الرمز غير متاحة مؤقتاً.' : 'Code delivery is temporarily unavailable.';
    }
    if (caught.payload.error) {
      if (caught.payload.error === 'Invalid verification code') {
        return isArabic ? 'رمز التحقق غير صحيح.' : 'The verification code is incorrect.';
      }
      if (caught.payload.error.includes('attempts exhausted')) {
        return isArabic ? 'تم استنفاد المحاولات. اطلب رمزاً جديداً.' : 'Verification attempts are exhausted. Request a new code.';
      }
      if (caught.payload.error.includes('already verified')) {
        return isArabic ? 'تم التحقق من وسيلة الاتصال بالفعل.' : 'This contact method is already verified.';
      }
    }
  }

  return isArabic ? 'تعذر إكمال التحقق حالياً.' : 'Verification could not be completed right now.';
}

async function refreshWebSessionClaims(): Promise<void> {
  const response = await fetch('/api/session/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Unable to refresh verified account session');
  }
}

export function AccountVerificationPanel({ locale }: { locale: string }) {
  const router = useRouter();
  const isArabic = locale === 'ar';
  const [state, setState] = useState<ContactVerificationState | null>(null);
  const [selected, setSelected] = useState<ContactVerificationChannel>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  async function reload() {
    const next = await getContactVerificationState();
    setState(next);
    const firstAvailable = next.channels.find((item) => item.available && !item.verifiedAt);
    if (firstAvailable) {
      setSelected(firstAvailable.channel);
    }
  }

  useEffect(() => {
    let active = true;
    getContactVerificationState()
      .then((next) => {
        if (!active) return;
        setState(next);
        const firstAvailable = next.channels.find((item) => item.available && !item.verifiedAt);
        if (firstAvailable) setSelected(firstAvailable.channel);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught, isArabic));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isArabic]);

  async function requestCode(channel: ContactVerificationChannel) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setSelected(channel);
    setCode('');
    try {
      const response = await requestContactVerification(channel);
      setExpiresAt(response.expiresAt);
      setSuccess(
        isArabic
          ? `تم إرسال رمز مكوّن من 6 أرقام إلى ${channelLabel(channel, true)} المسجل.`
          : `A 6-digit code was sent to your registered ${channelLabel(channel, false).toLowerCase()}.`
      );
    } catch (caught) {
      setError(errorMessage(caught, isArabic));
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await confirmContactVerification(selected, code);
      await refreshWebSessionClaims();
      setSuccess(
        isArabic
          ? `تم التحقق من ${channelLabel(selected, true)} بنجاح.`
          : `${channelLabel(selected, false)} verified successfully.`
      );
      setCode('');
      setExpiresAt(null);
      await reload();
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, isArabic));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="auth-status">{isArabic ? 'جارٍ تحميل حالة التحقق…' : 'Loading verification status…'}</p>;
  }

  if (!state) {
    return <p className="auth-error" role="alert">{error ?? (isArabic ? 'تعذر تحميل الحساب.' : 'Unable to load the account.')}</p>;
  }

  const selectedState = state.channels.find((item) => item.channel === selected);

  return (
    <div className="form-grid">
      <div className="trade-note-card">
        <strong>{isArabic ? 'حالة الحساب' : 'Account status'}</strong>
        <p>{state.status}</p>
      </div>

      {state.channels.map((item) => (
        <section className="value-card" key={item.channel}>
          <h3>{channelLabel(item.channel, isArabic)}</h3>
          <p>
            {!item.available
              ? (isArabic ? 'غير مضاف إلى الحساب.' : 'Not added to this account.')
              : item.verifiedAt
                ? (isArabic ? `تم التحقق: ${item.destination}` : `Verified: ${item.destination}`)
                : (isArabic ? `بانتظار التحقق: ${item.destination}` : `Verification required: ${item.destination}`)}
          </p>
          {item.available && !item.verifiedAt ? (
            <button
              className="button-secondary"
              type="button"
              disabled={busy}
              onClick={() => void requestCode(item.channel)}
            >
              {isArabic ? 'إرسال رمز التحقق' : 'Send verification code'}
            </button>
          ) : null}
        </section>
      ))}

      {selectedState?.available && !selectedState.verifiedAt ? (
        <form className="form-grid" onSubmit={confirmCode}>
          <label>
            {isArabic ? 'رمز التحقق' : 'Verification code'}
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              placeholder="000000"
            />
          </label>
          {expiresAt ? (
            <p className="auth-status">
              {isArabic ? 'الرمز صالح لمدة 10 دقائق.' : 'The code is valid for 10 minutes.'}
            </p>
          ) : null}
          <button className="button-primary" type="submit" disabled={busy || code.length !== 6}>
            {busy ? (isArabic ? 'جارٍ التحقق…' : 'Verifying…') : (isArabic ? 'تأكيد الرمز' : 'Confirm code')}
          </button>
        </form>
      ) : null}

      {success ? <p className="auth-status" role="status">{success}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
