'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  loadAccountExport,
  loadAccountProfile,
  removeAccountAvatar,
  saveAccountProfile,
  submitAccountClosure,
  uploadAccountAvatar,
  type AccountProfilePayload
} from '../lib/account-profile-api';

const allowedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumAvatarBytes = 2 * 1024 * 1024;

function optionalValue(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? '').trim();
  return value || null;
}

function profileError(error: unknown, isArabic: boolean): string {
  if (error instanceof AuthedRequestError) {
    if (error.status === 401) return isArabic ? 'انتهت جلسة الحساب.' : 'Your account session ended.';
    if (error.status === 429) return isArabic ? 'طلبات كثيرة. حاول لاحقاً.' : 'Too many requests. Try again later.';
    if (error.payload.error === 'Current password is incorrect') {
      return isArabic ? 'كلمة المرور الحالية غير صحيحة.' : 'The current password is incorrect.';
    }
  }
  return isArabic ? 'تعذر تحديث ملف الحساب.' : 'The account profile could not be updated.';
}

async function clearLocalWebSession(): Promise<void> {
  await fetch('/api/session', {
    method: 'DELETE',
    credentials: 'same-origin',
    cache: 'no-store'
  }).catch(() => undefined);
}

export function AccountProfilePanel({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [data, setData] = useState<AccountProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isBusiness, setIsBusiness] = useState(false);
  const [closureMode, setClosureMode] = useState<'close' | 'delete'>('close');
  const [avatarRevision, setAvatarRevision] = useState(0);

  async function reload() {
    const next = await loadAccountProfile();
    setData(next);
    setIsBusiness(next.profile.isBusiness);
  }

  useEffect(() => {
    let active = true;
    loadAccountProfile()
      .then((next) => {
        if (!active) return;
        setData(next);
        setIsBusiness(next.profile.isBusiness);
      })
      .catch((caught) => {
        if (active) setError(profileError(caught, isArabic));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isArabic]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await saveAccountProfile({
        displayName: String(form.get('displayName') ?? '').trim(),
        bio: optionalValue(form, 'bio'),
        city: optionalValue(form, 'city'),
        countryCode: optionalValue(form, 'countryCode')?.toUpperCase() ?? null,
        isBusiness: form.get('isBusiness') === 'on',
        businessName: optionalValue(form, 'businessName'),
        businessDescription: optionalValue(form, 'businessDescription'),
        businessWebsite: optionalValue(form, 'businessWebsite'),
        profileVisibility: form.get('profileVisibility') === 'private' ? 'private' : 'public',
        showCity: form.get('showCity') === 'on',
        showCountry: form.get('showCountry') === 'on',
        showBusinessDetails: form.get('showBusinessDetails') === 'on',
        showAvatar: form.get('showAvatar') === 'on'
      });
      setData(next);
      setIsBusiness(next.profile.isBusiness);
      setSuccess(isArabic ? 'تم حفظ الملف الشخصي.' : 'Profile saved.');
    } catch (caught) {
      setError(profileError(caught, isArabic));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('avatar');
    if (!(file instanceof File) || file.size === 0) return;
    if (!allowedAvatarTypes.has(file.type) || file.size > maximumAvatarBytes) {
      setError(isArabic ? 'استخدم صورة JPEG أو PNG أو WebP بحجم لا يتجاوز 2 ميغابايت.' : 'Use a JPEG, PNG, or WebP image no larger than 2 MiB.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await uploadAccountAvatar(file);
      await reload();
      setAvatarRevision((value) => value + 1);
      setSuccess(isArabic ? 'تم تحديث الصورة الشخصية.' : 'Avatar updated.');
      event.currentTarget.reset();
    } catch (caught) {
      setError(profileError(caught, isArabic));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAvatar() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await removeAccountAvatar();
      await reload();
      setAvatarRevision((value) => value + 1);
      setSuccess(isArabic ? 'تم حذف الصورة الشخصية.' : 'Avatar removed.');
    } catch (caught) {
      setError(profileError(caught, isArabic));
    } finally {
      setBusy(false);
    }
  }

  async function exportAccount() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const exported = await loadAccountExport();
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'suqnaa-account-export.json';
      link.click();
      URL.revokeObjectURL(url);
      setSuccess(isArabic ? 'تم إنشاء نسخة بيانات الحساب.' : 'Your account export was generated.');
    } catch (caught) {
      setError(profileError(caught, isArabic));
    } finally {
      setBusy(false);
    }
  }

  async function close(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await submitAccountClosure({
        currentPassword: String(form.get('currentPassword') ?? ''),
        mode: closureMode,
        acknowledgement: String(form.get('acknowledgement') ?? '').trim()
      });
      await clearLocalWebSession();
      window.location.assign(`/${locale}`);
    } catch (caught) {
      setError(profileError(caught, isArabic));
      setBusy(false);
    }
  }

  if (loading) return <p className="auth-status">{isArabic ? 'جارٍ تحميل الملف…' : 'Loading profile…'}</p>;
  if (!data) return <p className="auth-error" role="alert">{error ?? (isArabic ? 'تعذر تحميل الحساب.' : 'Unable to load account.')}</p>;

  return (
    <div className="form-grid">
      <section className="value-card">
        <h2>{isArabic ? 'الملف الشخصي' : 'Marketplace profile'}</h2>
        <p>{isArabic ? 'عدّل الاسم والوصف والموقع والبيانات التجارية الظاهرة في سوقنا.' : 'Edit the name, description, location, and business details used on your marketplace profile.'}</p>
        <form className="form-grid" onSubmit={save}>
          <label>{isArabic ? 'الاسم المعروض' : 'Display name'}<input name="displayName" defaultValue={data.user.displayName} minLength={2} maxLength={80} required /></label>
          <label>{isArabic ? 'نبذة' : 'Bio'}<textarea name="bio" defaultValue={data.profile.bio ?? ''} maxLength={1000} rows={4} /></label>
          <label>{isArabic ? 'المدينة' : 'City'}<input name="city" defaultValue={data.profile.city ?? ''} maxLength={120} /></label>
          <label>{isArabic ? 'رمز الدولة' : 'Country code'}<input name="countryCode" defaultValue={data.profile.countryCode ?? ''} minLength={2} maxLength={2} placeholder="AU" /></label>
          <label><input name="isBusiness" type="checkbox" defaultChecked={data.profile.isBusiness} onChange={(event) => setIsBusiness(event.currentTarget.checked)} /> {isArabic ? 'هذا ملف تجاري' : 'This is a business profile'}</label>
          {isBusiness ? (
            <>
              <label>{isArabic ? 'اسم النشاط' : 'Business name'}<input name="businessName" defaultValue={data.profile.businessName ?? ''} minLength={2} maxLength={120} required /></label>
              <label>{isArabic ? 'وصف النشاط' : 'Business description'}<textarea name="businessDescription" defaultValue={data.profile.businessDescription ?? ''} maxLength={1000} rows={3} /></label>
              <label>{isArabic ? 'موقع النشاط' : 'Business website'}<input name="businessWebsite" type="url" defaultValue={data.profile.businessWebsite ?? ''} maxLength={300} placeholder="https://example.com" /></label>
            </>
          ) : null}

          <h3>{isArabic ? 'الخصوصية' : 'Privacy'}</h3>
          <label>{isArabic ? 'ظهور الملف' : 'Profile visibility'}
            <select name="profileVisibility" defaultValue={data.profile.profileVisibility}>
              <option value="public">{isArabic ? 'عام' : 'Public'}</option>
              <option value="private">{isArabic ? 'خاص' : 'Private'}</option>
            </select>
          </label>
          <label><input name="showCity" type="checkbox" defaultChecked={data.profile.showCity} /> {isArabic ? 'إظهار المدينة' : 'Show city'}</label>
          <label><input name="showCountry" type="checkbox" defaultChecked={data.profile.showCountry} /> {isArabic ? 'إظهار الدولة' : 'Show country'}</label>
          <label><input name="showBusinessDetails" type="checkbox" defaultChecked={data.profile.showBusinessDetails} /> {isArabic ? 'إظهار بيانات النشاط' : 'Show business details'}</label>
          <label><input name="showAvatar" type="checkbox" defaultChecked={data.profile.showAvatar} /> {isArabic ? 'إظهار الصورة الشخصية' : 'Show avatar'}</label>
          <p className="auth-status">{isArabic ? 'البريد الإلكتروني ورقم الهاتف لا يظهران أبداً في الملف العام.' : 'Email and phone are never exposed by the public profile.'}</p>
          <button className="button-primary" type="submit" disabled={busy}>{isArabic ? 'حفظ الملف' : 'Save profile'}</button>
        </form>
      </section>

      <section className="value-card">
        <h2>{isArabic ? 'الصورة الشخصية' : 'Avatar'}</h2>
        {data.profile.hasAvatar ? <img key={avatarRevision} src="/api/authed/v1/account/profile/avatar" alt={isArabic ? 'الصورة الشخصية الحالية' : 'Current avatar'} width={160} height={160} /> : <p>{isArabic ? 'لا توجد صورة شخصية.' : 'No avatar uploaded.'}</p>}
        <form className="form-grid" onSubmit={uploadAvatar}>
          <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required />
          <p>{isArabic ? 'JPEG أو PNG أو WebP، حتى 2 ميغابايت.' : 'JPEG, PNG, or WebP, up to 2 MiB.'}</p>
          <button className="button-secondary" type="submit" disabled={busy}>{isArabic ? 'رفع الصورة' : 'Upload avatar'}</button>
        </form>
        {data.profile.hasAvatar ? <button className="button-secondary" type="button" disabled={busy} onClick={() => void deleteAvatar()}>{isArabic ? 'حذف الصورة' : 'Remove avatar'}</button> : null}
      </section>

      <section className="value-card">
        <h2>{isArabic ? 'نسخة بيانات الحساب' : 'Account data export'}</h2>
        <p>{isArabic ? 'نزّل نسخة JSON من بيانات ملفك وإعلاناتك وعروضك وطلباتك ومحادثاتك وتقاريرك.' : 'Download a JSON copy of your profile, listings, offers, orders, conversations, and submitted reports.'}</p>
        <button className="button-secondary" type="button" disabled={busy} onClick={() => void exportAccount()}>{isArabic ? 'تنزيل نسخة البيانات' : 'Download account export'}</button>
      </section>

      <section className="value-card">
        <h2>{isArabic ? 'إغلاق أو حذف الحساب' : 'Close or delete account'}</h2>
        <p>{isArabic ? 'الإغلاق يعطّل تسجيل الدخول ويخفي الملف. الحذف يزيل أيضاً بيانات الاتصال والملف الشخصي ويستبدل الهوية بمعرّف غير شخصي، مع الاحتفاظ بسجلات السوق اللازمة لسلامة الطلبات والتدقيق.' : 'Closing disables sign-in and hides the profile. Deletion also removes contact/profile identity and replaces it with a non-personal tombstone while retaining marketplace records needed for order and audit integrity.'}</p>
        <p className="auth-status">{isArabic ? 'نزّل نسخة بياناتك قبل المتابعة. هذه العملية لا تعيد فتح الحساب تلقائياً.' : 'Download your export before continuing. This workflow does not automatically reopen the account.'}</p>
        <form className="form-grid" onSubmit={close}>
          <label>{isArabic ? 'الإجراء' : 'Action'}
            <select value={closureMode} onChange={(event) => setClosureMode(event.currentTarget.value === 'delete' ? 'delete' : 'close')}>
              <option value="close">{isArabic ? 'إغلاق الحساب' : 'Close account'}</option>
              <option value="delete">{isArabic ? 'حذف البيانات الشخصية' : 'Delete personal account data'}</option>
            </select>
          </label>
          <label>{isArabic ? 'كلمة المرور الحالية' : 'Current password'}<input name="currentPassword" type="password" autoComplete="current-password" maxLength={200} required /></label>
          <label>{isArabic ? `اكتب ${closureMode === 'delete' ? 'DELETE' : 'CLOSE'} للتأكيد` : `Type ${closureMode === 'delete' ? 'DELETE' : 'CLOSE'} to confirm`}<input name="acknowledgement" autoComplete="off" required /></label>
          <button className="button-secondary" type="submit" disabled={busy}>{closureMode === 'delete' ? (isArabic ? 'حذف البيانات وإغلاق الحساب' : 'Delete data and close account') : (isArabic ? 'إغلاق الحساب' : 'Close account')}</button>
        </form>
      </section>

      {success ? <p className="auth-status" role="status">{success}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
