'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  loadOperationsVerifications,
  reviewOperationsVerification,
  type OperationsVerificationItem
} from '../lib/operations-verification-api';

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === 'ar' ? 'ar' : 'en-AU');
}

export function OperationsVerificationPanel({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [items, setItems] = useState<OperationsVerificationItem[]>([]);
  const [status, setStatus] = useState<'pending' | 'verified' | 'rejected' | 'expired' | 'all'>('pending');
  const [providerResult, setProviderResult] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const page = await loadOperationsVerifications({
        status,
        providerResult: providerResult
          ? providerResult as 'pending' | 'passed' | 'failed' | 'review_required' | 'expired'
          : undefined,
        limit: 50
      });
      setItems(page.items);
    } catch {
      setError(isArabic ? 'تعذر تحميل مراجعات التحقق.' : 'Verification reviews could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [status, providerResult]);

  async function review(event: FormEvent<HTMLFormElement>, item: OperationsVerificationItem) {
    event.preventDefault();
    if (busyId) return;
    const form = new FormData(event.currentTarget);
    const decision = String(form.get('decision')) as 'approve' | 'reject';
    const reasonCode = String(form.get('reasonCode') ?? '').trim();
    const note = String(form.get('note') ?? '').trim();
    if (decision === 'reject' && !reasonCode) {
      setError(isArabic ? 'يلزم سبب للرفض.' : 'A rejection reason is required.');
      return;
    }
    if (decision === 'approve' && item.providerResult === 'review_required' && !note) {
      setError(isArabic ? 'يلزم تدوين سبب الموافقة اليدوية.' : 'A review note is required for manual approval.');
      return;
    }

    setBusyId(item.id);
    setError(null);
    try {
      await reviewOperationsVerification({
        id: item.id,
        decision,
        reasonCode: reasonCode || undefined,
        note: note || undefined
      });
      await reload();
    } catch {
      setError(isArabic ? 'تعذر حفظ قرار المراجعة.' : 'The review decision could not be saved.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="value-card">
      <div className="form-grid">
        <div>
          <h2>{isArabic ? 'مراجعات تحقق البائع' : 'Seller verification reviews'}</h2>
          <p>
            {isArabic
              ? 'نتيجة خدمة التحقق لا تعتمد الحساب تلقائياً. الموافقة أو الرفض يتمان هنا مع سجل تدقيق.'
              : 'Provider results never approve an account automatically. Approval or rejection happens here with an audit trail.'}
          </p>
        </div>
        <label>
          {isArabic ? 'حالة المراجعة' : 'Review status'}
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="pending">{isArabic ? 'قيد المراجعة' : 'Pending review'}</option>
            <option value="verified">{isArabic ? 'تم التحقق' : 'Verified'}</option>
            <option value="rejected">{isArabic ? 'مرفوض' : 'Rejected'}</option>
            <option value="expired">{isArabic ? 'منتهي' : 'Expired'}</option>
            <option value="all">{isArabic ? 'الكل' : 'All'}</option>
          </select>
        </label>
        <label>
          {isArabic ? 'نتيجة الخدمة' : 'Provider result'}
          <select value={providerResult} onChange={(event) => setProviderResult(event.target.value)}>
            <option value="">{isArabic ? 'الكل' : 'All'}</option>
            <option value="pending">{isArabic ? 'قيد التنفيذ' : 'Pending'}</option>
            <option value="passed">{isArabic ? 'اجتاز' : 'Passed'}</option>
            <option value="review_required">{isArabic ? 'مراجعة يدوية' : 'Manual review'}</option>
            <option value="failed">{isArabic ? 'لم يجتز' : 'Failed'}</option>
            <option value="expired">{isArabic ? 'انتهت الجلسة' : 'Expired'}</option>
          </select>
        </label>
      </div>

      {loading ? <p className="auth-status">{isArabic ? 'جارٍ التحميل…' : 'Loading…'}</p> : null}
      {!loading && items.length === 0 ? <p>{isArabic ? 'لا توجد عناصر مطابقة.' : 'No matching verification reviews.'}</p> : null}
      {items.map((item) => (
        <article className="trade-note-card" key={item.id}>
          <h3>{item.displayName}</h3>
          <p><strong>{isArabic ? 'المستوى' : 'Level'}:</strong> {item.level}</p>
          <p><strong>{isArabic ? 'الحساب' : 'Account'}:</strong> {item.accountStatus}</p>
          <p><strong>{isArabic ? 'الدولة' : 'Country'}:</strong> {item.countryCode ?? '—'}</p>
          <p><strong>{isArabic ? 'النشاط' : 'Business'}:</strong> {item.profile.businessName ?? '—'}</p>
          <p><strong>{isArabic ? 'نتيجة الخدمة' : 'Provider result'}:</strong> {item.providerResult.replaceAll('_', ' ')}</p>
          <p><strong>{isArabic ? 'تم التقديم' : 'Submitted'}:</strong> {formatDate(item.submittedAt, locale)}</p>
          <p><strong>{isArabic ? 'وسيلة الاتصال' : 'Contact'}:</strong> {item.contact.email ?? item.contact.phoneE164 ?? '—'}</p>

          {item.status === 'pending' && item.providerResult !== 'pending' && item.providerResult !== 'expired' ? (
            <form className="form-grid" onSubmit={(event) => void review(event, item)}>
              <label>
                {isArabic ? 'القرار' : 'Decision'}
                <select name="decision" defaultValue={item.providerResult === 'failed' ? 'reject' : 'approve'}>
                  <option value="approve">{isArabic ? 'موافقة' : 'Approve'}</option>
                  <option value="reject">{isArabic ? 'رفض' : 'Reject'}</option>
                </select>
              </label>
              <label>
                {isArabic ? 'رمز سبب الرفض' : 'Rejection reason code'}
                <input name="reasonCode" maxLength={120} pattern="[a-z0-9_.-]+" placeholder="identity_mismatch" />
              </label>
              <label>
                {isArabic ? 'ملاحظة المراجعة' : 'Review note'}
                <textarea name="note" maxLength={2000} rows={4} />
              </label>
              <button className="button-primary" disabled={busyId === item.id} type="submit">
                {busyId === item.id ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (isArabic ? 'حفظ القرار' : 'Save decision')}
              </button>
            </form>
          ) : null}
        </article>
      ))}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </section>
  );
}
