'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  canPrepareCheckout,
  checkoutNextActionMessage
} from '../lib/checkout-presentation';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import {
  getOrderActivityDetail,
  type OrderActivityItem
} from '../lib/order-activity-api';
import {
  prepareProtectedCheckout,
  type CheckoutPreparationResponse
} from '../lib/payment-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

function formatAmount(
  amount: string | number,
  currency: string,
  locale: string
): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return `${amount} ${currency}`;
  }

  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency}`;
  }
}

function paymentMethodLabel(value: string | null, isArabic: boolean): string {
  if (!value) {
    return '—';
  }

  const labels: Record<string, [string, string]> = {
    card: ['Card', 'بطاقة'],
    bank_transfer: ['Bank transfer', 'تحويل بنكي'],
    wallet: ['Wallet', 'محفظة'],
    xmr: ['XMR', 'XMR']
  };
  return (labels[value] ?? [value, value])[isArabic ? 1 : 0];
}

function preparationFailure(caught: unknown, isArabic: boolean): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic
        ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.'
        : 'Your account session ended. Sign in again.';
    }
    if (caught.status === 404) {
      return isArabic
        ? 'لم يعد هذا الطلب متاحاً لهذا الحساب.'
        : 'This order is no longer available to this account.';
    }
    if (caught.status === 409) {
      return isArabic
        ? 'لم تعد حالة الطلب أو الحجز تسمح بإعداد الدفع.'
        : 'The order or reservation no longer permits payment preparation.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `طلبات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many requests. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
    }
    if (caught.status === 403 || caught.payload.requiresHumanCheck) {
      return isArabic
        ? 'تعذر التحقق من الفحص الأمني. أكمله مرة أخرى.'
        : 'The security check could not be verified. Complete it again.';
    }
  }

  return isArabic
    ? 'تعذر إعداد الدفع حالياً.'
    : 'Payment preparation could not be completed right now.';
}

export function OrderCheckoutPreparation({
  locale,
  orderId
}: {
  locale: string;
  orderId: string;
}) {
  const isArabic = locale === 'ar';
  const [order, setOrder] = useState<OrderActivityItem | null>(null);
  const [configuration, setConfiguration] =
    useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preparation, setPreparation] =
    useState<CheckoutPreparationResponse | null>(null);

  useEffect(() => {
    let active = true;

    getOrderActivityDetail(orderId)
      .then((response) => {
        if (active) {
          setOrder(response.order);
        }
      })
      .catch(() => {
        if (active) {
          setOrder(null);
        }
      });

    getChallengeConfiguration()
      .then((value) => {
        if (active) {
          setConfiguration(value);
        }
      })
      .catch(() => {
        if (active) {
          setConfigurationError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  if (!order || !canPrepareCheckout(order.role, order.status)) {
    return null;
  }

  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeAction = configuration?.actions.paymentCheckout;
  const challengeReady =
    !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);

  async function submitPreparation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !configuration ||
      configurationError ||
      !challengeReady ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await prepareProtectedCheckout(
        orderId,
        challengeToken ?? undefined
      );
      setPreparation(result);
      setOpen(false);
    } catch (caught) {
      setError(preparationFailure(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="order-safety-card order-checkout-card">
        <span className="buyer-action-label">
          {isArabic ? 'إعداد الدفع' : 'Payment preparation'}
        </span>
        <h2>
          {isArabic ? 'تحقق من تفاصيل الطلب المحفوظة' : 'Verify the stored order details'}
        </h2>
        <p>
          {isArabic
            ? 'يتم أخذ المبلغ والعملة وطريقة الدفع من الطلب المحفوظ. لن يتم إرسال أي دفعة في هذه الخطوة.'
            : 'Amount, currency and payment method come from the stored order. No payment is sent in this step.'}
        </p>
        <dl className="order-detail-facts">
          <div>
            <dt>{isArabic ? 'المبلغ' : 'Amount'}</dt>
            <dd>{formatAmount(order.amount, order.currencyCode, locale)}</dd>
          </div>
          <div>
            <dt>{isArabic ? 'طريقة الدفع' : 'Payment method'}</dt>
            <dd>{paymentMethodLabel(order.paymentMethod, isArabic)}</dd>
          </div>
        </dl>

        {configurationError ? (
          <p className="auth-error" role="alert">
            {isArabic
              ? 'تعذر تحميل إعدادات الأمان. إعداد الدفع متوقف.'
              : 'Security settings could not be loaded. Payment preparation is unavailable.'}
          </p>
        ) : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        {preparation ? (
          <div className="offer-order-summary" role="status">
            <strong>
              {isArabic ? 'إعداد مزود الدفع مطلوب' : 'Payment provider setup required'}
            </strong>
            <span>
              {checkoutNextActionMessage(
                preparation.payment.nextAction,
                isArabic
              )}
            </span>
            <span>
              {isArabic
                ? 'لم يتم إرسال أي دفعة ولم تتغير حالة الطلب.'
                : 'No payment was sent and the order status did not change.'}
            </span>
          </div>
        ) : (
          <button
            className="button-primary"
            type="button"
            disabled={!configuration || configurationError}
            onClick={() => {
              setError(null);
              setOpen(true);
              setChallengeToken(null);
              setResetKey((value) => value + 1);
            }}
          >
            {isArabic ? 'إعداد الدفع' : 'Prepare payment'}
          </button>
        )}
      </section>

      {open ? (
        <div
          className="offer-confirmation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-preparation-title"
        >
          <form onSubmit={submitPreparation}>
            <div>
              <span className="buyer-action-label">
                {isArabic ? 'تأكيد إعداد الدفع' : 'Confirm payment preparation'}
              </span>
              <h2 id="checkout-preparation-title">
                {formatAmount(order.amount, order.currencyCode, locale)}
              </h2>
              <p>
                {isArabic
                  ? 'سيتم التحقق من الطلب والحجز والحسابات مرة أخرى. هذه الخطوة لا ترسل الأموال.'
                  : 'The order, reservation and accounts will be checked again. This step does not send funds.'}
              </p>
            </div>

            {challengeEnabled && siteKey && challengeAction ? (
              <>
                <ChallengeProviderScript />
                <ChallengeWidget
                  key={`${challengeAction}-${resetKey}`}
                  siteKey={siteKey}
                  action={challengeAction}
                  locale={locale}
                  resetKey={resetKey}
                  onToken={setChallengeToken}
                  onExpired={() => setChallengeToken(null)}
                  onError={() => {
                    setChallengeToken(null);
                    setError(
                      isArabic
                        ? 'تعذر إكمال الفحص الأمني.'
                        : 'The security check could not be completed.'
                    );
                  }}
                />
              </>
            ) : null}

            <div className="offer-confirmation-actions">
              <button
                className="button-primary"
                type="submit"
                disabled={
                  !configuration ||
                  configurationError ||
                  !challengeReady ||
                  submitting
                }
              >
                {submitting
                  ? (isArabic ? 'جارٍ التحقق…' : 'Checking…')
                  : (isArabic ? 'تأكيد' : 'Confirm')}
              </button>
              <button
                className="button-secondary"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setOpen(false);
                  setChallengeToken(null);
                }}
              >
                {isArabic ? 'رجوع' : 'Back'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
