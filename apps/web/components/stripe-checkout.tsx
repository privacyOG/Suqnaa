'use client';

import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe
} from '@stripe/react-stripe-js';
import { useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import { createCardIntent } from '../lib/trading-api';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function PaymentForm({
  locale,
  orderId,
  returnUrl
}: {
  locale: string;
  orderId: string;
  returnUrl: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const isArabic = locale === 'ar';
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) {
      return;
    }

    setSubmitting(true);
    setPaymentError(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl }
    });

    if (error) {
      setPaymentError(error.message ?? (isArabic ? 'فشل الدفع.' : 'Payment failed.'));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="stripe-checkout-form">
      <PaymentElement />
      {paymentError ? (
        <p className="auth-error" role="alert">{paymentError}</p>
      ) : null}
      <div className="actions" style={{ marginTop: '1.5rem' }}>
        <button
          type="submit"
          className="button-primary"
          disabled={!stripe || submitting}
        >
          {submitting
            ? (isArabic ? 'جارٍ المعالجة…' : 'Processing…')
            : (isArabic ? 'ادفع الآن' : 'Pay now')}
        </button>
        <a
          className="button-secondary"
          href={`/${locale}/activity/orders/${orderId}`}
        >
          {isArabic ? 'إلغاء' : 'Cancel'}
        </a>
      </div>
    </form>
  );
}

export function StripeCheckoutPanel({
  locale,
  orderId
}: {
  locale: string;
  orderId: string;
}) {
  const isArabic = locale === 'ar';
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const returnUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/${locale}/activity/orders/${orderId}?paid=1`
    : `/${locale}/activity/orders/${orderId}?paid=1`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    createCardIntent(orderId)
      .then((response) => {
        if (active) {
          setClientSecret(response.clientSecret);
        }
      })
      .catch((caught) => {
        if (!active) {
          return;
        }
        if (caught instanceof AuthedRequestError) {
          if (caught.status === 404) {
            setError(isArabic ? 'الطلب غير موجود.' : 'Order not found.');
            return;
          }
          if (caught.status === 409) {
            setError(
              isArabic
                ? 'لا يمكن الدفع لهذا الطلب. قد يكون تم دفعه أو إلغاؤه.'
                : 'This order cannot be paid. It may already be paid or cancelled.'
            );
            return;
          }
          if (caught.status === 503) {
            setError(
              isArabic
                ? 'الدفع بالبطاقة غير متاح حالياً.'
                : 'Card payment is not available right now.'
            );
            return;
          }
        }
        setError(
          isArabic
            ? 'تعذر تحضير صفحة الدفع. حاول مرة أخرى.'
            : 'Could not prepare payment. Please try again.'
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isArabic, orderId]);

  if (!stripePublishableKey) {
    return (
      <div className="buyer-session-panel">
        <strong>{isArabic ? 'الدفع بالبطاقة غير متاح' : 'Card payment unavailable'}</strong>
        <p>
          {isArabic
            ? 'يرجى اختيار طريقة دفع أخرى.'
            : 'Please choose another payment method.'}
        </p>
        <a className="button-secondary" href={`/${locale}/activity/orders/${orderId}`}>
          {isArabic ? 'العودة إلى الطلب' : 'Back to order'}
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="buyer-session-panel">
        <p className="auth-status">{isArabic ? 'جارٍ تحضير صفحة الدفع…' : 'Preparing payment…'}</p>
      </div>
    );
  }

  if (error || !clientSecret) {
    return (
      <div className="buyer-session-panel">
        <strong>{isArabic ? 'تعذر تحميل صفحة الدفع' : 'Payment unavailable'}</strong>
        <p className="auth-error" role="alert">{error}</p>
        <a className="button-secondary" href={`/${locale}/activity/orders/${orderId}`}>
          {isArabic ? 'العودة إلى الطلب' : 'Back to order'}
        </a>
      </div>
    );
  }

  return (
    <div className="stripe-checkout-shell">
      <div className="listing-seller-card" style={{ maxWidth: '520px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>
          {isArabic ? 'الدفع بالبطاقة' : 'Card payment'}
        </h2>
        <p className="seller-safety-note" style={{ marginBottom: '1.5rem' }}>
          {isArabic
            ? 'أدخل تفاصيل بطاقتك أدناه. تتم معالجة المدفوعات بأمان عبر Stripe.'
            : 'Enter your card details below. Payments are processed securely via Stripe.'}
        </p>
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: { theme: 'stripe' } }}
        >
          <PaymentForm locale={locale} orderId={orderId} returnUrl={returnUrl} />
        </Elements>
      </div>
    </div>
  );
}
