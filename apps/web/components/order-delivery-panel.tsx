'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getOrderActivityDetail, type OrderActivityItem } from '../lib/order-activity-api';
import {
  getOrderDelivery,
  getOrderTimeline,
  issuePickupProof,
  setPickupDetails,
  submitDeliveryEvidence,
  verifyPickupProof,
  type OrderDeliveryContext,
  type OrderTimelineResponse
} from '../lib/order-delivery-api';

function formatAddress(address: NonNullable<OrderDeliveryContext['delivery']>['shippingAddress']): string {
  if (!address) return '—';
  return [address.line1, address.line2, address.locality, address.region, address.postalCode, address.countryCode]
    .filter(Boolean).join(', ');
}

function timelineLabel(type: string, isArabic: boolean): string {
  const labels: Record<string, [string, string]> = {
    order_created: ['Order created', 'تم إنشاء الطلب'],
    delivery_selected: ['Shipping selected', 'تم اختيار الشحن'],
    pickup_selected: ['Pickup selected', 'تم اختيار الاستلام'],
    payment_received: ['Payment verified', 'تم التحقق من الدفع'],
    pickup_details_set: ['Pickup details available', 'تمت إضافة تفاصيل الاستلام'],
    ready_for_pickup: ['Ready for pickup', 'جاهز للاستلام'],
    pickup_proof_issued: ['Pickup proof issued', 'تم إصدار رمز الاستلام'],
    pickup_completed: ['Pickup proof verified', 'تم التحقق من رمز الاستلام'],
    shipped: ['Shipped', 'تم الشحن'],
    delivered: ['Delivery evidence recorded', 'تم تسجيل دليل التسليم'],
    received_confirmed: ['Buyer confirmed receipt', 'أكد المشتري الاستلام']
  };
  return (labels[type] ?? [type.replaceAll('_', ' '), type.replaceAll('_', ' ')])[isArabic ? 1 : 0];
}

export function OrderDeliveryPanel({ locale, orderId }: { locale: string; orderId: string }) {
  const isArabic = locale === 'ar';
  const [order, setOrder] = useState<OrderActivityItem | null>(null);
  const [delivery, setDelivery] = useState<OrderDeliveryContext | null>(null);
  const [timeline, setTimeline] = useState<OrderTimelineResponse | null>(null);
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [pickupLine1, setPickupLine1] = useState('');
  const [pickupLine2, setPickupLine2] = useState('');
  const [pickupLocality, setPickupLocality] = useState('');
  const [pickupRegion, setPickupRegion] = useState('NSW');
  const [pickupPostcode, setPickupPostcode] = useState('');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [orderResult, deliveryResult, timelineResult] = await Promise.all([
      getOrderActivityDetail(orderId),
      getOrderDelivery(orderId),
      getOrderTimeline(orderId)
    ]);
    setOrder(orderResult.order);
    setDelivery(deliveryResult);
    setTimeline(timelineResult);
  }

  useEffect(() => {
    let active = true;
    Promise.all([getOrderActivityDetail(orderId), getOrderDelivery(orderId), getOrderTimeline(orderId)])
      .then(([orderResult, deliveryResult, timelineResult]) => {
        if (!active) return;
        setOrder(orderResult.order);
        setDelivery(deliveryResult);
        setTimeline(timelineResult);
        const pickup = deliveryResult.delivery?.pickupAddress;
        if (pickup) {
          setPickupLine1(pickup.line1);
          setPickupLine2(pickup.line2 ?? '');
          setPickupLocality(pickup.locality);
          setPickupRegion(pickup.region);
          setPickupPostcode(pickup.postalCode);
          setPickupInstructions(deliveryResult.delivery?.pickupInstructions ?? '');
        }
      })
      .catch(() => { if (active) setError(isArabic ? 'تعذر تحميل تفاصيل التسليم.' : 'Delivery details could not be loaded.'); });
    return () => { active = false; };
  }, [isArabic, orderId]);

  if (!order || !delivery || order.status === 'pending' || !delivery.delivery) return null;
  const mode = delivery.delivery.mode;
  const status = delivery.fulfilment?.status ?? 'not_started';
  const seller = delivery.role === 'seller';
  const buyer = delivery.role === 'buyer';

  async function perform(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch {
      setError(isArabic ? 'تعذر تحديث تفاصيل التسليم. حدّث الطلب وحاول مرة أخرى.' : 'Delivery details could not be updated. Refresh the order and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function savePickup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}$/.test(pickupPostcode.trim())) {
      setError(isArabic ? 'أدخل رمزاً بريدياً أسترالياً من أربعة أرقام.' : 'Enter a four-digit Australian postcode.');
      return;
    }
    await perform(() => setPickupDetails(orderId, {
      address: {
        line1: pickupLine1.trim(),
        ...(pickupLine2.trim() ? { line2: pickupLine2.trim() } : {}),
        locality: pickupLocality.trim(),
        region: pickupRegion.trim(),
        postalCode: pickupPostcode.trim(),
        countryCode: 'AU'
      },
      ...(pickupInstructions.trim() ? { instructions: pickupInstructions.trim() } : {})
    }));
  }

  async function createProof() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await issuePickupProof(orderId);
      setPickupCode(result.pickupProof.code);
      await reload();
    } catch {
      setError(isArabic ? 'تعذر إصدار رمز الاستلام.' : 'Pickup proof could not be issued.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      await verifyPickupProof(orderId, verifyCode);
      setVerifyCode('');
    });
  }

  async function recordEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      await submitDeliveryEvidence(orderId, {
        note: evidenceNote.trim(),
        ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {})
      });
      setEvidenceNote('');
      setEvidenceUrl('');
    });
  }

  return (
    <section className="order-safety-card" data-order-delivery-panel>
      <span className="buyer-action-label">{isArabic ? 'تفاصيل التسليم المحمية' : 'Protected delivery details'}</span>
      <h2>{mode === 'shipping' ? (isArabic ? 'الشحن والتتبع' : 'Shipping and tracking') : (isArabic ? 'الاستلام المباشر' : 'Pickup')}</h2>
      <p>{isArabic
        ? 'تظهر العناوين الكاملة فقط للمشاركين المصرح لهم في الطلب. سجل الأحداث أدناه لا يحتوي على عنوان الشارع.'
        : 'Full addresses are visible only to authorised order participants. The timeline below never contains the street address.'}</p>

      {mode === 'shipping' ? (
        <dl className="order-detail-facts">
          <div><dt>{isArabic ? 'طريقة الشحن' : 'Shipping method'}</dt><dd>{delivery.delivery.shippingMethodLabel ?? '—'}</dd></div>
          <div><dt>{isArabic ? 'المستلم' : 'Recipient'}</dt><dd>{delivery.delivery.recipientName ?? '—'}</dd></div>
          <div><dt>{isArabic ? 'عنوان الشحن' : 'Shipping address'}</dt><dd>{formatAddress(delivery.delivery.shippingAddress)}</dd></div>
          <div><dt>{isArabic ? 'شركة الشحن' : 'Carrier'}</dt><dd>{delivery.fulfilment?.carrier ?? delivery.delivery.shippingCarrier ?? '—'}</dd></div>
          <div><dt>{isArabic ? 'رقم التتبع' : 'Tracking'}</dt><dd>{delivery.fulfilment?.trackingReference ?? '—'}</dd></div>
        </dl>
      ) : (
        <dl className="order-detail-facts">
          <div><dt>{isArabic ? 'موقع الاستلام' : 'Pickup location'}</dt><dd>{formatAddress(delivery.delivery.pickupAddress)}</dd></div>
          <div><dt>{isArabic ? 'تعليمات' : 'Instructions'}</dt><dd>{delivery.delivery.pickupInstructions ?? '—'}</dd></div>
        </dl>
      )}

      {delivery.fulfilment?.trackingUrl ? (
        <a className="button-secondary" href={delivery.fulfilment.trackingUrl} target="_blank" rel="noreferrer noopener">
          {isArabic ? 'فتح رابط التتبع الخارجي' : 'Open external tracking link'}
        </a>
      ) : null}

      {seller && mode === 'pickup' && status === 'not_started' ? (
        <form className="seller-form-grid" onSubmit={savePickup}>
          <h3>{isArabic ? 'موقع الاستلام الدقيق' : 'Exact pickup location'}</h3>
          <label><span>{isArabic ? 'العنوان' : 'Address line 1'}</span><input value={pickupLine1} minLength={3} maxLength={160} required onChange={(e) => setPickupLine1(e.target.value)} /></label>
          <label><span>{isArabic ? 'العنوان الإضافي' : 'Address line 2'}</span><input value={pickupLine2} maxLength={160} onChange={(e) => setPickupLine2(e.target.value)} /></label>
          <label><span>{isArabic ? 'الضاحية' : 'Suburb'}</span><input value={pickupLocality} minLength={2} maxLength={100} required onChange={(e) => setPickupLocality(e.target.value)} /></label>
          <label><span>{isArabic ? 'الولاية' : 'State'}</span><input value={pickupRegion} minLength={2} maxLength={80} required onChange={(e) => setPickupRegion(e.target.value)} /></label>
          <label><span>{isArabic ? 'الرمز البريدي' : 'Postcode'}</span><input value={pickupPostcode} pattern="[0-9]{4}" maxLength={4} required onChange={(e) => setPickupPostcode(e.target.value)} /></label>
          <label><span>{isArabic ? 'تعليمات الاستلام' : 'Pickup instructions'}</span><textarea value={pickupInstructions} maxLength={1000} onChange={(e) => setPickupInstructions(e.target.value)} /></label>
          <button className="button-secondary" type="submit" disabled={busy}>{isArabic ? 'حفظ موقع الاستلام' : 'Save pickup location'}</button>
        </form>
      ) : null}

      {buyer && mode === 'pickup' && status === 'ready_for_pickup' ? (
        <div className="offer-order-summary">
          <strong>{isArabic ? 'رمز إثبات الاستلام' : 'Pickup proof'}</strong>
          <p>{isArabic ? 'أنشئ الرمز عند وصولك. اعرضه للبائع فقط عند استلام السلعة.' : 'Generate the code when you arrive. Show it to the seller only when taking possession of the item.'}</p>
          <button className="button-secondary" type="button" disabled={busy} onClick={createProof}>{isArabic ? 'إنشاء رمز استلام' : 'Generate pickup code'}</button>
          {pickupCode ? <code className="buyer-action-label" data-pickup-proof-code>{pickupCode}</code> : null}
        </div>
      ) : null}

      {seller && mode === 'pickup' && status === 'ready_for_pickup' ? (
        <form className="seller-form-grid" onSubmit={verifyProof}>
          <h3>{isArabic ? 'التحقق من رمز المشتري' : 'Verify buyer pickup code'}</h3>
          <input value={verifyCode} minLength={8} maxLength={32} required autoComplete="off" onChange={(e) => setVerifyCode(e.target.value)} />
          <button className="button-secondary" type="submit" disabled={busy}>{isArabic ? 'تحقق وأكمل الاستلام' : 'Verify and complete pickup'}</button>
        </form>
      ) : null}

      {seller && mode === 'shipping' && status === 'shipped' ? (
        <form className="seller-form-grid" onSubmit={recordEvidence}>
          <h3>{isArabic ? 'دليل التسليم' : 'Delivery evidence'}</h3>
          <label><span>{isArabic ? 'ملاحظة التسليم' : 'Delivery note'}</span><textarea value={evidenceNote} minLength={3} maxLength={2000} required onChange={(e) => setEvidenceNote(e.target.value)} /></label>
          <label><span>{isArabic ? 'رابط دليل HTTPS اختياري' : 'Optional HTTPS evidence link'}</span><input type="url" value={evidenceUrl} maxLength={1000} onChange={(e) => setEvidenceUrl(e.target.value)} /></label>
          <p>{isArabic ? 'هذا دليل يقدمه البائع وليس تأكيداً مستقلاً من شركة الشحن.' : 'This is seller-submitted evidence, not independent carrier verification.'}</p>
          <button className="button-secondary" type="submit" disabled={busy}>{isArabic ? 'تسجيل التسليم' : 'Record delivery'}</button>
        </form>
      ) : null}

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {timeline ? (
        <div className="offer-order-summary">
          <strong>{isArabic ? 'سجل الطلب' : 'Order timeline'}</strong>
          <ol>
            {timeline.events.map((event) => (
              <li key={event.id}>
                <span>{timelineLabel(event.type, isArabic)}</span>{' '}
                <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString(isArabic ? 'ar-AU' : 'en-AU')}</time>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
