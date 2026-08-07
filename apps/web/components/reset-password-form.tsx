'use client';

import { FormEvent, useState } from 'react';
import {
  PasswordRecoveryError,
  resetPassword
} from '../lib/password-security-api';

export function ResetPasswordForm({
  locale,
  initialToken = ''
}: {
  locale: string;
  initialToken?: string;
}) {
  const isArabic = locale === 'ar';
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (newPassword !== confirmPassword) {
      setError(isArabic ? 'كلمتا المرور غير متطابقتين.' : 'The passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await resetPassword(token.trim(), newPassword);
      setComplete(true);
    } catch (caught) {
      if (caught instanceof PasswordRecoveryError && caught.status === 409) {
        setError(isArabic ? 'اختر كلمة مرور مختلفة عن كلمة المرور الحالية.' : 'Choose a password different from the current password.');
      } else if (caught instanceof PasswordRecoveryError && caught.status === 429) {
        setError(isArabic ? 'طلبات كثيرة. حاول لاحقاً.' : 'Too many attempts. Try again later.');
      } else {
        setError(isArabic ? 'رمز إعادة التعيين غير صالح أو انتهت صلاحيته.' : 'The reset token is invalid or has expired.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <div className="form-grid">
        <p className="auth-status" role="status">
          {isArabic
            ? 'تم تغيير كلمة المرور وإلغاء جميع جلسات الحساب الحالية.'
            : 'Your password was changed and all existing account sessions were revoked.'}
        </p>
        <a className="button-primary" href={`/${locale}/account/sign-in`}>
          {isArabic ? 'تسجيل الدخول' : 'Sign in'}
        </a>
      </div>
    );
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        {isArabic ? 'رمز إعادة التعيين' : 'Reset token'}
        <input
          name="token"
          value={token}
          onChange={(event) => setToken(event.target.value.trim())}
          minLength={40}
          maxLength={120}
          autoComplete="one-time-code"
          required
        />
      </label>
      <label>
        {isArabic ? 'كلمة المرور الجديدة' : 'New password'}
        <input name="newPassword" type="password" minLength={10} maxLength={200} autoComplete="new-password" required />
      </label>
      <label>
        {isArabic ? 'تأكيد كلمة المرور' : 'Confirm password'}
        <input name="confirmPassword" type="password" minLength={10} maxLength={200} autoComplete="new-password" required />
      </label>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="button-primary" type="submit" disabled={busy || token.trim().length < 40}>
        {busy ? (isArabic ? 'جارٍ التغيير…' : 'Changing…') : (isArabic ? 'تغيير كلمة المرور' : 'Reset password')}
      </button>
    </form>
  );
}
