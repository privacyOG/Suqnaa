'use client';

import { useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  beginSellerPayoutOnboarding,
  loadSellerPayoutStatus,
  updateSellerPayoutSchedule,
  type SellerPayoutStatusPayload
} from '../lib/seller-payout-api';

function formatMoney(value: string, currency: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
    : `${value} ${currency}`;
}

export function SellerPayoutPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isArabic = locale === 'ar';
  const [payload, setPayload] = useState<SellerPayoutStatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const next = await loadSellerPayoutStatus();
    setPayload(next);
  }

  useEffect(() => {
    reload().catch(() => setError(isArabic ? 'تعذر تحميل بيانات الدفعات.' : 'Payout information could not be loaded.'));
  }, [isArabic]);

  async function onboard() {
    setBusy(true);
    setError(null);
    try {
      const response = await beginSellerPayoutOnboarding(locale);
      const target = new URL(response.onboarding.hostedUrl);
      if (target.protocol !== 'https:' || !(
        target.hostname === 'connect.stripe.com' || target.hostname.endsWith('.connect.stripe.com') ||
        target.hostname === 'accounts.stripe.com' || target.hostname.endsWith('.accounts.stripe.com')
      )) throw new Error('Untrusted onboarding URL');
      window.location.assign(target.toString());
    } catch (caught) {
      if (caught instanceof AuthedRequestError && caught.status === 403) {
        setError(isArabic ? 'أكمل تحقق البائع أولاً.' : 'Complete seller verification before payout onboarding.');
      } else if (caught instanceof AuthedRequestError && caught.status === 503) {
        setError(isArabic ? 'إعداد الدفعات غير متاح حالياً.' : 'Payout setup is not available in this deployment.');
      } else {
        setError(isArabic ? 'تعذر فتح إعداد الدفعات.' : 'Payout onboarding could not be opened.');
      }
      setBusy(false);
    }
  }

  async function useWeeklyFriday() {
    setBusy(true);
    setError(null);
    try {
      await updateSellerPayoutSchedule({ interval: 'weekly', anchor: 'friday' });
      await reload();
    } catch {
      setError(isArabic ? 'تعذر تحديث جدول الدفعات.' : 'Payout schedule could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  const payouts = payload?.payouts;
  if (!payouts) return <p className="auth-status">{error ?? (isArabic ? 'جارٍ التحميل…' : 'Loading payouts…')}</p>;

  return (
    <div className="form-grid">
      <section className="value-card">
        <h2>{isArabic ? 'حساب الدفعات' : 'Payout account'}</h2>
        {!payouts.enabled ? <p className="auth-error">{isArabic ? 'تسويات البائع غير مفعّلة.' : 'Seller settlement is disabled in this deployment.'}</p> : null}
        {payouts.account ? (
          <>
            <p><strong>{isArabic ? 'الحالة' : 'Status'}:</strong> {payouts.account.onboardingStatus}</p>
            <p><strong>{isArabic ? 'التحويلات' : 'Transfers'}:</strong> {payouts.account.transfersEnabled ? '✓' : '—'}</p>
            <p><strong>{isArabic ? 'الدفعات البنكية' : 'Payouts'}:</strong> {payouts.account.payoutsEnabled ? '✓' : '—'}</p>
            <p><strong>{isArabic ? 'متطلبات معلقة' : 'Outstanding requirements'}:</strong> {payouts.account.requirementsDue}</p>
            <p><strong>{isArabic ? 'الجدول' : 'Schedule'}:</strong> {payouts.account.payoutInterval} · {payouts.account.payoutAnchor}</p>
            {payouts.account.disabledReason ? <p className="auth-error">{payouts.account.disabledReason.replaceAll('_', ' ')}</p> : null}
          </>
        ) : <p>{isArabic ? 'لم يتم إنشاء حساب دفعات بعد.' : 'No payout account has been created yet.'}</p>}
        <div className="actions">
          <button className="button-primary" disabled={!payouts.enabled || busy} onClick={onboard}>
            {busy ? (isArabic ? 'جارٍ الفتح…' : 'Opening…') : (isArabic ? 'إعداد أو متابعة الدفعات' : 'Set up or continue payouts')}
          </button>
          {payouts.account ? <button className="button-secondary" disabled={busy} onClick={useWeeklyFriday}>{isArabic ? 'دفعة أسبوعية يوم الجمعة' : 'Weekly Friday payouts'}</button> : null}
        </div>
        <p>{isArabic ? 'تُدخل البيانات البنكية والهوية داخل صفحة مزود الدفع المستضافة ولا تحفظها سوقنا.' : 'Banking and identity details are entered on the provider-hosted page and are not stored by Suqnaa.'}</p>
      </section>

      <section className="value-card">
        <h2>{isArabic ? 'التسويات' : 'Settlements'}</h2>
        {payouts.settlements.length === 0 ? <p>{isArabic ? 'لا توجد تسويات بعد.' : 'No settlements yet.'}</p> : payouts.settlements.map((settlement) => (
          <div className="trade-note-card" key={settlement.id}>
            <strong>{formatMoney(settlement.net_amount, settlement.currency_code)} · {settlement.status}</strong>
            <p>{isArabic ? 'إجمالي' : 'Gross'} {formatMoney(settlement.gross_amount, settlement.currency_code)} · {isArabic ? 'عمولة' : 'Commission'} {formatMoney(settlement.commission_amount, settlement.currency_code)}</p>
            <p>{isArabic ? 'الطلب' : 'Order'} {settlement.order_id}</p>
            {settlement.failure_code ? <p className="auth-error">{settlement.failure_code.replaceAll('_', ' ')}</p> : null}
          </div>
        ))}
      </section>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
