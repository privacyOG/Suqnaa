'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import {
  cancelPendingOrder,
  type OrderCancellationResponse
} from '../lib/order-cancellation-api';
import {
  canCancelPendingOrder,
  cancellationSuccessMessage
} from '../lib/order-cancellation-presentation';
import {
  getOrderActivityDetail,
  type OrderActivityItem
} from '../lib/order-activity-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

function cancellationFailure(caught: unknown, isArabic: boolean): string {
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
        ? 'تغيّرت حالة الطلب أو الدفع ولم يعد الإلغاء مسموحاً.'
        : 'The order or payment state changed and cancellation is no longer allowed.';
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
    ? 'تعذر إلغاء الطلب حالياً.'
    : 'The order could not be cancelled right now.';
}

function validCancellationResponse(
  response: OrderCancellationResponse,
  orderId: string
): boolean {
  return response.accepted === true &&
    response.order.id === orderId &&
    response.order.status === 'cancelled' &&
    typeof response.cancellation.unchanged === 'boolean';
}

export function OrderCancellationAction({
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
  const [success, setSuccess] = useState<string | null>(null);

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

  if (!order || !canCancelPendingOrder(order.role, order.status)) {
    return null;
  }

  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeAction = configuration?.actions.orderCancel;
  const challengeReady =
    !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);

  async function submitCancellation(event: FormEvent<HTMLFormElement>) {
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
    setSuccess(null);
    try {
      const result = await cancelPendingOrder(
        orderId,
        challengeToken ?? undefined
      );
      if (!validCancellationResponse(result, orderId)) {
        throw new Error('Invalid cancellation response');
      }
      setSuccess(cancellationSuccessMessage(
        result.cancellation.unchanged,
        isArabic
      ));
      setOpen(false);
      window.location.reload();
    } catch (caught) {
      setError(cancellationFailure(caught, isArabic));
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
      <section className="order-safety-card order-cancellation-card">
        <span className="buyer-action-label">
          {isArabic ? 'إلغاء الطلب' : 'Cancel order'}
        </span>
        <h2>
          {isArabic ? 'أوقف هذه المعاملة قبل الدفع' : 'Stop this transaction before payment'}
        </h2>
        <p>
          {isArabic
            ? 'يؤدي الإلغاء إلى إلغاء الطلب والعرض وإعادة الإعلان إلى السوق. لا يمكن التراجع عن هذا الإجراء.'
            : 'Cancellation cancels the order and accepted offer, then returns the listing to the marketplace. This cannot be undone.'}
        </p>

        {configurationError ? (
          <p className="auth-error" role="alert">
            {isArabic
              ? 'تعذر تحميل إعدادات الأمان. إلغاء الطلب متوقف.'
              : 'Security settings could not be loaded. Order cancellation is unavailable.'}
          </p>
        ) : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {success ? <p className="auth-status" role="status">{success}</p> : null}

        <button
          className="button-secondary"
          type="button"
          disabled={!configuration || configurationError || submitting}
          onClick={() => {
            setError(null);
            setSuccess(null);
            setOpen(true);
            setChallengeToken(null);
            setResetKey((value) => value + 1);
          }}
        >
          {isArabic ? 'إلغاء الطلب' : 'Cancel order'}
        </button>
      </section>

      {open ? (
        <div
          className="offer-confirmation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-cancellation-title"
        >
          <form onSubmit={submitCancellation}>
            <div>
              <span className="buyer-action-label">
                {isArabic ? 'تأكيد الإلغاء' : 'Confirm cancellation'}
              </span>
              <h2 id="order-cancellation-title">
                {isArabic ? 'هل تريد إلغاء هذا الطلب؟' : 'Cancel this order?'}
              </h2>
              <p>
                {isArabic
                  ? 'سيُلغى العرض المقبول وسيصبح الإعلان متاحاً لمشترين آخرين. لا يمكن التراجع.'
                  : 'The accepted offer will be cancelled and the listing will become available to other buyers. This cannot be undone.'}
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
                  ? (isArabic ? 'جارٍ الإلغاء…' : 'Cancelling…')
                  : (isArabic ? 'تأكيد الإلغاء' : 'Confirm cancellation')}
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
                {isArabic ? 'الاحتفاظ بالطلب' : 'Keep order'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
