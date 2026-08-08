'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  configureOrderDelivery,
  getListingShippingOptions,
  getOrderDelivery,
  type OrderDeliveryContext,
  type ShippingOption
} from '../lib/order-delivery-api';

function money(value: string | number, currency: string, locale: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
      style: 'currency', currency, maximumFractionDigits: 2
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency}`;
  }
}

export function OrderDeliverySelection({
  locale,
  orderId,
  listingId,
  onState
}: {
  locale: string;
  orderId: string;
  listingId: string;
  onState: (state: { ready: boolean; totalAmount?: string | number; mode?: 'shipping' | 'pickup' }) => void;
}) {
  const isArabic = locale === 'ar';
  const [context, setContext] = useState<OrderDeliveryContext | null>(null);
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [mode, setMode] = useState<'shipping' | 'pickup'>('shipping');
  const [optionId, setOptionId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [locality, setLocality] = useState('');
  const [region, setRegion] = useState('NSW');
  const [postalCode, setPostalCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const delivery = await getOrderDelivery(orderId);
    setContext(delivery);
    if (delivery.delivery) {
      setMode(delivery.delivery.mode);
      setOptionId(delivery.delivery.shippingOptionId ?? '');
      setRecipientName(delivery.delivery.recipientName ?? '');
      setLine1(delivery.delivery.shippingAddress?.line1 ?? '');
      setLine2(delivery.delivery.shippingAddress?.line2 ?? '');
      setLocality(delivery.delivery.shippingAddress?.locality ?? '');
      setRegion(delivery.delivery.shippingAddress?.region ?? 'NSW');
      setPostalCode(delivery.delivery.shippingAddress?.postalCode ?? '');
      onState({ ready: true, totalAmount: delivery.pricing.totalAmount, mode: delivery.delivery.mode });
    } else {
      onState({ ready: false, totalAmount: delivery.pricing.totalAmount });
    }
    try {
      const shipping = await getListingShippingOptions(listingId);
      setOptions(shipping.options);
      if (!delivery.delivery && shipping.options.length > 0) setOptionId(shipping.options[0].id);
    } catch {
      setOptions([]);
      if (!delivery.delivery) setMode('pickup');
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([getOrderDelivery(orderId), getListingShippingOptions(listingId).catch(() => ({ listingId, options: [] }))])
      .then(([delivery, shipping]) => {
        if (!active) return;
        setContext(delivery);
        setOptions(shipping.options);
        if (delivery.delivery) {
          setMode(delivery.delivery.mode);
          setOptionId(delivery.delivery.shippingOptionId ?? '');
          setRecipientName(delivery.delivery.recipientName ?? '');
          setLine1(delivery.delivery.shippingAddress?.line1 ?? '');
          setLine2(delivery.delivery.shippingAddress?.line2 ?? '');
          setLocality(delivery.delivery.shippingAddress?.locality ?? '');
          setRegion(delivery.delivery.shippingAddress?.region ?? 'NSW');
          setPostalCode(delivery.delivery.shippingAddress?.postalCode ?? '');
          onState({ ready: true, totalAmount: delivery.pricing.totalAmount, mode: delivery.delivery.mode });
        } else {
          if (shipping.options.length > 0) setOptionId(shipping.options[0].id);
          else setMode('pickup');
          onState({ ready: false, totalAmount: delivery.pricing.totalAmount });
        }
      })
      .catch(() => {
        if (active) setError(isArabic ? 'تعذر تحميل خيارات التسليم.' : 'Delivery options could not be loaded.');
      });
    return () => { active = false; };
  }, [isArabic, listingId, orderId, onState]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mode === 'shipping') {
      if (!optionId || recipientName.trim().length < 2 || line1.trim().length < 3 || locality.trim().length < 2 || region.trim().length < 2 || !/^\d{4}$/.test(postalCode.trim())) {
        setError(isArabic ? 'أكمل عنوان الشحن الأسترالي واختيار طريقة الشحن.' : 'Complete the Australian shipping address and shipping method.');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await configureOrderDelivery(orderId, mode === 'pickup'
        ? { mode: 'pickup' }
        : {
            mode: 'shipping',
            shippingOptionId: optionId,
            recipientName: recipientName.trim(),
            address: {
              line1: line1.trim(),
              ...(line2.trim() ? { line2: line2.trim() } : {}),
              locality: locality.trim(),
              region: region.trim(),
              postalCode: postalCode.trim(),
              countryCode: 'AU'
            }
          });
      await load();
    } catch {
      setError(isArabic ? 'تعذر حفظ طريقة التسليم. تحقق من الطلب وحاول مجدداً.' : 'Delivery selection could not be saved. Check the order and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!context) return error ? <p className="auth-error">{error}</p> : null;

  return (
    <section className="order-safety-card" data-order-delivery-selection>
      <span className="buyer-action-label">{isArabic ? 'التسليم والاستلام' : 'Delivery or pickup'}</span>
      <h2>{isArabic ? 'اختر طريقة استلام الطلب قبل الدفع' : 'Choose how you will receive the order before payment'}</h2>
      <p>{isArabic
        ? 'يُحفظ العنوان الكامل داخل الطلب المحمي فقط. لا يظهر في الإعلان أو سجل الأحداث العام، ولا يمكن تغييره بعد بدء الدفع.'
        : 'Your full address is stored only inside the protected order. It is never exposed on the listing or timeline and cannot change after payment starts.'}</p>

      <form className="seller-form-grid" onSubmit={submit}>
        <label>
          <span>{isArabic ? 'طريقة الإيفاء' : 'Fulfilment method'}</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as 'shipping' | 'pickup')}>
            {options.length > 0 ? <option value="shipping">{isArabic ? 'شحن' : 'Shipping'}</option> : null}
            <option value="pickup">{isArabic ? 'استلام مباشر' : 'Pickup'}</option>
          </select>
        </label>

        {mode === 'shipping' ? (
          <>
            <label>
              <span>{isArabic ? 'طريقة الشحن' : 'Shipping method'}</span>
              <select value={optionId} required onChange={(event) => setOptionId(event.target.value)}>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} · {money(option.amount, option.currencyCode, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label><span>{isArabic ? 'اسم المستلم' : 'Recipient name'}</span><input value={recipientName} maxLength={120} required onChange={(e) => setRecipientName(e.target.value)} /></label>
            <label><span>{isArabic ? 'العنوان' : 'Address line 1'}</span><input value={line1} maxLength={160} required onChange={(e) => setLine1(e.target.value)} /></label>
            <label><span>{isArabic ? 'العنوان الإضافي' : 'Address line 2'}</span><input value={line2} maxLength={160} onChange={(e) => setLine2(e.target.value)} /></label>
            <label><span>{isArabic ? 'المدينة / الضاحية' : 'Suburb / locality'}</span><input value={locality} maxLength={100} required onChange={(e) => setLocality(e.target.value)} /></label>
            <label><span>{isArabic ? 'الولاية' : 'State / region'}</span><input value={region} maxLength={80} required onChange={(e) => setRegion(e.target.value)} /></label>
            <label><span>{isArabic ? 'الرمز البريدي' : 'Postcode'}</span><input value={postalCode} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required onChange={(e) => setPostalCode(e.target.value)} /></label>
          </>
        ) : (
          <p>{isArabic
            ? 'سيشارك البائع موقع الاستلام الكامل داخل الطلب المحمي بعد تأكيد الدفع.'
            : 'The seller will disclose the exact pickup location inside the protected order after payment is confirmed.'}</p>
        )}

        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button-secondary" type="submit" disabled={busy}>
          {busy ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (context.delivery ? (isArabic ? 'تحديث طريقة التسليم' : 'Update delivery choice') : (isArabic ? 'حفظ طريقة التسليم' : 'Save delivery choice'))}
        </button>
      </form>

      {context.delivery ? (
        <dl className="order-detail-facts">
          <div><dt>{isArabic ? 'سعر السلعة' : 'Item'}</dt><dd>{money(context.pricing.itemAmount, context.pricing.currencyCode, locale)}</dd></div>
          <div><dt>{isArabic ? 'الشحن' : 'Shipping'}</dt><dd>{money(context.pricing.shippingAmount, context.pricing.currencyCode, locale)}</dd></div>
          <div><dt>{isArabic ? 'الإجمالي' : 'Total'}</dt><dd>{money(context.pricing.totalAmount, context.pricing.currencyCode, locale)}</dd></div>
        </dl>
      ) : null}
    </section>
  );
}
