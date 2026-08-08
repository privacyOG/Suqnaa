'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  type OrderReturnRow,
  acknowledgeProtectedReturn,
  readOrderProtection,
  shipProtectedReturn
} from '../lib/order-protection-api';

function statusLabel(value: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    authorized: ['Return authorised', 'تم السماح بالإرجاع'],
    awaiting_shipment: ['Awaiting shipment', 'بانتظار الشحن'],
    in_transit: ['Return in transit', 'الإرجاع قيد الشحن'],
    delivered: ['Return delivered', 'تم تسليم الإرجاع'],
    received: ['Seller accepted return', 'قبل البائع الإرجاع'],
    contested: ['Return contested', 'الإرجاع محل اعتراض'],
    resolved: ['Return resolved', 'تم حل الإرجاع'],
    expired: ['Return window expired', 'انتهت مهلة الإرجاع'],
    cancelled: ['Return cancelled', 'تم إلغاء الإرجاع']
  };
  return labels[value]?.[ar ? 1 : 0] ?? value.replaceAll('_', ' ');
}

function formatDate(value: string | null, ar: boolean): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(ar ? 'ar-AU' : 'en-AU');
}

export function OrderProtectionPanel({ locale, orderId, userId }: { locale: string; orderId: string; userId: string }) {
  const ar = locale === 'ar';
  const [returns, setReturns] = useState<OrderReturnRow[]>([]);
  const [caseCount, setCaseCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carrier, setCarrier] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [contestNote, setContestNote] = useState('');

  const refresh = useCallback(async () => {
    const snapshot = await readOrderProtection(orderId);
    setReturns(snapshot.returns);
    setCaseCount(snapshot.cases.length);
  }, [orderId]);

  useEffect(() => {
    void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [refresh]);

  const activeReturn = useMemo(() => returns.find((item) => !['resolved', 'expired', 'cancelled'].includes(item.status)) ?? returns[0] ?? null, [returns]);
  const isBuyer = activeReturn?.buyer_id === userId;
  const isSeller = activeReturn?.seller_id === userId;
  const buyerCanShip = Boolean(activeReturn && isBuyer && ['authorized', 'awaiting_shipment'].includes(activeReturn.status));
  const sellerCanAcknowledge = Boolean(activeReturn && isSeller && ['in_transit', 'delivered', 'received', 'contested'].includes(activeReturn.status));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitShipment(event: FormEvent) {
    event.preventDefault();
    if (!activeReturn) return;
    await run(async () => {
      await shipProtectedReturn(activeReturn.id, {
        carrier,
        trackingReference,
        ...(trackingUrl.trim() ? { trackingUrl } : {})
      });
      setCarrier('');
      setTrackingReference('');
      setTrackingUrl('');
    });
  }

  if (caseCount === 0 && returns.length === 0) return null;

  return (
    <section className="seller-session-panel" aria-labelledby="order-protection-heading">
      <div className="eyebrow">{ar ? 'حماية المشتري والبائع' : 'Buyer & seller protection'}</div>
      <h2 id="order-protection-heading">{ar ? 'الإرجاع والحماية' : 'Returns and protection'}</h2>
      <p>
        {ar
          ? 'تُعرض هنا إجراءات الحماية التي تم اعتمادها بعد مراجعة النزاع. لا يؤدي الإرجاع وحده إلى نقل الأموال؛ أي استرداد أو تحرير يحتاج إلى إجراء دفع معتمد بشكل منفصل.'
          : 'Protection actions authorised after dispute review appear here. A return does not itself move money; any refund or seller release still requires a separately authorised payment operation.'}
      </p>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {activeReturn ? (
        <div className="seller-form">
          <p><strong>{ar ? 'الحالة:' : 'Status:'}</strong> {statusLabel(activeReturn.status, ar)}</p>
          <p><strong>{ar ? 'سبب الإرجاع:' : 'Return reason:'}</strong> {activeReturn.reason}</p>
          <p><strong>{ar ? 'مهلة الشحن:' : 'Ship by:'}</strong> {formatDate(activeReturn.return_due_at, ar)}</p>
          {activeReturn.carrier ? <p><strong>{ar ? 'شركة الشحن:' : 'Carrier:'}</strong> {activeReturn.carrier}</p> : null}
          {activeReturn.tracking_reference ? <p><strong>{ar ? 'رقم التتبع:' : 'Tracking:'}</strong> {activeReturn.tracking_reference}</p> : null}
          {activeReturn.seller_condition_note ? <p><strong>{ar ? 'ملاحظة البائع:' : 'Seller note:'}</strong> {activeReturn.seller_condition_note}</p> : null}

          {buyerCanShip ? (
            <form onSubmit={submitShipment} className="seller-form">
              <label>
                {ar ? 'شركة الشحن' : 'Carrier'}
                <input value={carrier} onChange={(event) => setCarrier(event.target.value)} minLength={2} maxLength={80} required disabled={busy} />
              </label>
              <label>
                {ar ? 'رقم التتبع' : 'Tracking reference'}
                <input value={trackingReference} onChange={(event) => setTrackingReference(event.target.value)} minLength={2} maxLength={200} required disabled={busy} />
              </label>
              <label>
                {ar ? 'رابط التتبع HTTPS (اختياري)' : 'HTTPS tracking URL (optional)'}
                <input type="url" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} maxLength={1000} disabled={busy} />
              </label>
              <button className="button-primary" type="submit" disabled={busy || carrier.trim().length < 2 || trackingReference.trim().length < 2}>
                {ar ? 'تسجيل شحن الإرجاع' : 'Record return shipment'}
              </button>
            </form>
          ) : null}

          {sellerCanAcknowledge ? (
            <div className="seller-form">
              <button className="button-primary" type="button" disabled={busy} onClick={() => void run(() => acknowledgeProtectedReturn(activeReturn.id, { condition: 'accepted' }))}>
                {ar ? 'قبول السلعة المعادة' : 'Accept returned item'}
              </button>
              <label>
                {ar ? 'سبب الاعتراض على حالة الإرجاع' : 'Reason for contesting return condition'}
                <textarea value={contestNote} onChange={(event) => setContestNote(event.target.value)} minLength={8} maxLength={4000} disabled={busy} />
              </label>
              <button className="button-secondary" type="button" disabled={busy || contestNote.trim().length < 8} onClick={() => void run(async () => {
                await acknowledgeProtectedReturn(activeReturn.id, { condition: 'contested', note: contestNote });
                setContestNote('');
              })}>
                {ar ? 'الاعتراض على حالة الإرجاع' : 'Contest return condition'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <p>{ar ? 'تم تسجيل حالة حماية لهذا الطلب ولا يوجد إرجاع نشط.' : 'A protection case exists for this order with no active return.'}</p>
      )}
    </section>
  );
}
