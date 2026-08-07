'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  changeAccountPassword,
  listSecuritySessions,
  revokeAllSecuritySessions,
  revokeSecuritySession,
  type SecuritySessionRecord
} from '../lib/password-security-api';

function formatDate(value: string, locale: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(locale === 'ar' ? 'ar' : 'en-AU');
}

function securityError(caught: unknown, isArabic: boolean): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.' : 'Your account session ended. Sign in again.';
    }
    if (caught.status === 429) {
      return isArabic ? 'طلبات كثيرة. حاول لاحقاً.' : 'Too many security requests. Try again later.';
    }
    if (caught.payload.error === 'Current password is incorrect') {
      return isArabic ? 'كلمة المرور الحالية غير صحيحة.' : 'The current password is incorrect.';
    }
    if (caught.payload.error === 'Choose a different password') {
      return isArabic ? 'اختر كلمة مرور جديدة مختلفة.' : 'Choose a different new password.';
    }
  }
  return isArabic ? 'تعذر تحديث إعدادات أمان الحساب.' : 'Account security could not be updated right now.';
}

async function clearLocalWebSession(): Promise<void> {
  await fetch('/api/session', {
    method: 'DELETE',
    credentials: 'same-origin',
    cache: 'no-store'
  }).catch(() => undefined);
}

export function AccountSecurityPanel({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [sessions, setSessions] = useState<SecuritySessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function reloadSessions() {
    const next = await listSecuritySessions();
    setSessions(next);
  }

  useEffect(() => {
    let active = true;
    listSecuritySessions()
      .then((next) => {
        if (active) setSessions(next);
      })
      .catch((caught) => {
        if (active) setError(securityError(caught, isArabic));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isArabic]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (newPassword !== confirmPassword) {
      setError(isArabic ? 'كلمتا المرور الجديدتان غير متطابقتين.' : 'The new passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await changeAccountPassword(currentPassword, newPassword);
      await clearLocalWebSession();
      window.location.assign(`/${locale}/account/sign-in`);
    } catch (caught) {
      setError(securityError(caught, isArabic));
    } finally {
      setBusy(false);
    }
  }

  async function revokeOne(sessionId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await revokeSecuritySession(sessionId);
      await reloadSessions();
      setSuccess(isArabic ? 'تم إلغاء الجلسة المحددة.' : 'The selected session was revoked.');
    } catch (caught) {
      setError(securityError(caught, isArabic));
    } finally {
      setBusy(false);
    }
  }

  async function revokeAll() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await revokeAllSecuritySessions();
      await clearLocalWebSession();
      window.location.assign(`/${locale}/account/sign-in`);
    } catch (caught) {
      setError(securityError(caught, isArabic));
      setBusy(false);
    }
  }

  return (
    <div className="form-grid">
      <section className="value-card">
        <h2>{isArabic ? 'تغيير كلمة المرور' : 'Change password'}</h2>
        <p>
          {isArabic
            ? 'بعد تغيير كلمة المرور سيتم إلغاء جميع الجلسات، بما في ذلك هذا الجهاز، وستحتاج إلى تسجيل الدخول مجدداً.'
            : 'Changing your password revokes every session, including this device, and requires you to sign in again.'}
        </p>
        <form className="form-grid" onSubmit={changePassword}>
          <label>
            {isArabic ? 'كلمة المرور الحالية' : 'Current password'}
            <input name="currentPassword" type="password" autoComplete="current-password" maxLength={200} required />
          </label>
          <label>
            {isArabic ? 'كلمة المرور الجديدة' : 'New password'}
            <input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={200} required />
          </label>
          <label>
            {isArabic ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password'}
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={200} required />
          </label>
          <button className="button-primary" type="submit" disabled={busy}>
            {busy ? (isArabic ? 'جارٍ التحديث…' : 'Updating…') : (isArabic ? 'تغيير كلمة المرور' : 'Change password')}
          </button>
        </form>
      </section>

      <section className="value-card">
        <h2>{isArabic ? 'الجلسات النشطة' : 'Active sessions'}</h2>
        <p>
          {isArabic
            ? 'راجع الأجهزة التي لديها رمز تجديد جلسة صالح. يمكنك إلغاء أي جلسة أو إلغاء الجميع.'
            : 'Review devices with a valid refresh session. You can revoke one session or revoke all sessions.'}
        </p>
        {loading ? <p className="auth-status">{isArabic ? 'جارٍ التحميل…' : 'Loading sessions…'}</p> : null}
        {!loading && sessions.length === 0 ? (
          <p className="auth-status">{isArabic ? 'لا توجد جلسات تجديد نشطة.' : 'No active refresh sessions remain.'}</p>
        ) : null}
        {sessions.map((session) => (
          <div className="trade-note-card" key={session.id}>
            <strong>{session.userAgent || (isArabic ? 'جهاز غير معروف' : 'Unknown device')}</strong>
            <p>{isArabic ? 'عنوان الشبكة' : 'Network address'}: {session.ipAddress ?? '—'}</p>
            <p>{isArabic ? 'بدأت' : 'Started'}: {formatDate(session.createdAt, locale)}</p>
            <p>{isArabic ? 'تنتهي' : 'Expires'}: {formatDate(session.expiresAt, locale)}</p>
            <button className="button-secondary" type="button" disabled={busy} onClick={() => void revokeOne(session.id)}>
              {isArabic ? 'إلغاء هذه الجلسة' : 'Revoke this session'}
            </button>
          </div>
        ))}
        <button className="button-secondary" type="button" disabled={busy || sessions.length === 0} onClick={() => void revokeAll()}>
          {isArabic ? 'إلغاء جميع الجلسات' : 'Revoke all sessions'}
        </button>
      </section>

      {success ? <p className="auth-status" role="status">{success}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
