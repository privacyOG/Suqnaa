'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  getSellerShippingOptions,
  replaceListingShippingOptions,
  type SellerShippingOptionsResponse
} from '../lib/order-delivery-api';

type EditableOption = {
  label: string;
  carrier: string;
  amount: string;
  etaMinDays: string;
  etaMaxDays: string;
};

function blankOption(): EditableOption {
  return { label: '', carrier: '', amount: '0.00', etaMinDays: '', etaMaxDays: '' };
}

export function ListingShippingOptionsForm({ locale, listingId }: { locale: string; listingId: string }) {
  const isArabic = locale === 'ar';
  const [context, setContext] = useState<SellerShippingOptionsResponse | null>(null);
  const [options, setOptions] = useState<EditableOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getSellerShippingOptions(listingId)
      .then((result) => {
        if (!active) return;
        setContext(result);
        setOptions(result.options.map((option) => ({
          label: option.label,
          carrier: option.carrier ?? '',
          amount: Number(option.amount).toFixed(2),
          etaMinDays: option.etaMinDays === null ? '' : String(option.etaMinDays),
          etaMaxDays: option.etaMaxDays === null ? '' : String(option.etaMaxDays)
        })));
      })
      .catch(() => { if (active) setError(isArabic ? 'تعذر تحميل أسعار الشحن.' : 'Shipping rates could not be loaded.'); });
    return () => { active = false; };
  }, [isArabic, listingId]);

  function update(index: number, key: keyof EditableOption, value: string) {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? { ...option, [key]: value } : option));
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context?.editable || busy) return;
    const payload = [];
    for (const option of options) {
      const amount = Number(option.amount);
      const etaMin = option.etaMinDays.trim() ? Number(option.etaMinDays) : undefined;
      const etaMax = option.etaMaxDays.trim() ? Number(option.etaMaxDays) : undefined;
      if (option.label.trim().length < 2 || !Number.isFinite(amount) || amount < 0 || amount > 9999.99 ||
          ((etaMin === undefined) !== (etaMax === undefined)) ||
          (etaMin !== undefined && etaMax !== undefined && (etaMin < 0 || etaMax < etaMin || etaMax > 90))) {
        setError(isArabic ? 'راجع اسم كل طريقة وسعرها ونطاق أيام التوصيل.' : 'Check each shipping label, rate, and delivery-day range.');
        return;
      }
      payload.push({
        label: option.label.trim(),
        ...(option.carrier.trim() ? { carrier: option.carrier.trim() } : {}),
        amount,
        ...(etaMin !== undefined && etaMax !== undefined ? { etaMinDays: etaMin, etaMaxDays: etaMax } : {})
      });
    }
    setBusy(true);
    setError(null);
    try {
      const result = await replaceListingShippingOptions(listingId, payload);
      setOptions(result.options.map((option) => ({
        label: option.label,
        carrier: option.carrier ?? '',
        amount: Number(option.amount).toFixed(2),
        etaMinDays: option.etaMinDays === null ? '' : String(option.etaMinDays),
        etaMaxDays: option.etaMaxDays === null ? '' : String(option.etaMaxDays)
      })));
      setSaved(true);
    } catch {
      setError(isArabic ? 'تعذر حفظ أسعار الشحن. قد يكون الإعلان محجوزاً أو لم يعد قابلاً للتعديل.' : 'Shipping rates could not be saved. The listing may be reserved or no longer editable.');
    } finally {
      setBusy(false);
    }
  }

  if (!context) return error ? <p className="auth-error">{error}</p> : null;

  return (
    <section className="seller-form-shell" data-shipping-options-form>
      <div>
        <div className="eyebrow">{isArabic ? 'الشحن' : 'Shipping'}</div>
        <h2>{isArabic ? 'طرق وأسعار الشحن الثابتة' : 'Fixed shipping methods and rates'}</h2>
        <p>{isArabic
          ? 'يتم نسخ الطريقة والسعر إلى الطلب عند اختيار المشتري. بعد حجز الإعلان لا يمكن تغيير خياراته لهذا الطلب.'
          : 'The chosen method and rate are snapshotted into the order. Once the listing is reserved, its shipping choices cannot be changed for that order.'}</p>
      </div>

      {!context.allowDelivery ? <p className="auth-status">{isArabic ? 'فعّل خيار التوصيل في تفاصيل الإعلان لإضافة أسعار الشحن.' : 'Enable delivery on the listing to add shipping rates.'}</p> : null}
      {!context.editable ? <p className="auth-status">{isArabic ? 'تم قفل أسعار الشحن لأن الإعلان لم يعد مسودة أو نشطاً.' : 'Shipping rates are locked because this listing is no longer draft or active.'}</p> : null}

      <form className="form-grid" onSubmit={submit}>
        {options.map((option, index) => (
          <div className="value-card" key={`shipping-option-${index}`}>
            <label><span>{isArabic ? 'اسم الطريقة' : 'Method label'}</span><input value={option.label} minLength={2} maxLength={80} required disabled={!context.editable} onChange={(e) => update(index, 'label', e.target.value)} /></label>
            <label><span>{isArabic ? 'شركة الشحن' : 'Carrier (optional)'}</span><input value={option.carrier} maxLength={80} disabled={!context.editable} onChange={(e) => update(index, 'carrier', e.target.value)} /></label>
            <label><span>{isArabic ? `السعر (${context.currencyCode})` : `Rate (${context.currencyCode})`}</span><input type="number" step="0.01" min="0" max="9999.99" value={option.amount} required disabled={!context.editable} onChange={(e) => update(index, 'amount', e.target.value)} /></label>
            <label><span>{isArabic ? 'أقل مدة بالأيام' : 'Minimum days'}</span><input type="number" min="0" max="60" value={option.etaMinDays} disabled={!context.editable} onChange={(e) => update(index, 'etaMinDays', e.target.value)} /></label>
            <label><span>{isArabic ? 'أقصى مدة بالأيام' : 'Maximum days'}</span><input type="number" min="0" max="90" value={option.etaMaxDays} disabled={!context.editable} onChange={(e) => update(index, 'etaMaxDays', e.target.value)} /></label>
            {context.editable ? <button className="button-secondary" type="button" onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}>{isArabic ? 'إزالة الطريقة' : 'Remove method'}</button> : null}
          </div>
        ))}

        {context.editable && context.allowDelivery && options.length < 8 ? (
          <button className="button-secondary" type="button" onClick={() => setOptions((current) => [...current, blankOption()])}>
            {isArabic ? 'إضافة طريقة شحن' : 'Add shipping method'}
          </button>
        ) : null}
        {context.editable ? <button className="button-primary" type="submit" disabled={busy}>{busy ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (isArabic ? 'حفظ أسعار الشحن' : 'Save shipping rates')}</button> : null}
        {saved ? <p className="auth-status">{isArabic ? 'تم حفظ أسعار الشحن.' : 'Shipping rates saved.'}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
