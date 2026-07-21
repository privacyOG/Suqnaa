'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import {
  getOrderActivityDetail,
  type OrderActivityItem
} from '../lib/order-activity-api';
import {
  getOrderPaymentContext,
  type FulfilmentMutationInput,
  type FulfilmentMutationResponse,
  type OrderPaymentContextResponse,
  updateOrderFulfilment
} from '../lib/order-fulfilment-api';
import {
  availableFulfilmentActions,
  type AvailableFulfilmentAction,
  fulfilmentStatusLabel,
  fulfilmentSuccessMessage
} from '../lib/order-fulfilment-presentation';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

function failureMessage(caught: unknown, isArabic: boolean): string {
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
        ? 'تغيّرت حالة الطلب أو الدفع أو الإيفاء. حدّث الصفحة وحاول مرة أخرى.'
        : 'The order, payment, or fulfilment state changed. Refresh and try again.';
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
    ? 'تعذر تحديث حالة الإيفاء حالياً.'
    : 'The fulfilment state could not be updated right now.';
}

function expectedStatus(action: AvailableFulfilmentAction) {
  if (action === 'ready_for_pickup') {
    return 'ready_for_pickup' as const;
  }
  if (action === 'shipped') {
    return 'shipped' as const;
  }
  return 'received_confirmed' as const;
}

function validMutationResponse(
  response: FulfilmentMutationResponse,
  orderId: string,
  action: AvailableFulfilmentAction,
  input: FulfilmentMutationInput
): boolean {
  if (
    response.accepted !== true ||
    response.orderId !== orderId ||
    response.fulfilment.status !== expectedStatus(action) ||
    response.payment.releaseEnabled !== false ||
    typeof response.fulfilment.unchanged !== 'boolean' ||
    typeof response.fulfilment.id !== 'string' ||
    typeof response.fulfilment.updatedAt !== 'string'
  ) {
    return false;
  }

  return input.action !== 'shipped' ||
    (response.fulfilment.carrier === input.carrier &&
      response.fulfilment.trackingReference === input.trackingReference);
}

function actionLabel(action: AvailableFulfilmentAction, isArabic: boolean): string {
  if (action === 'ready_for_pickup') {
    return isArabic ? 'جاهز للاستلام' : 'Ready for pickup';
  }
  if (action === 'shipped') {
    return isArabic ? 'تم الشحن' : 'Mark as shipped';
  }
  return isArabic ? 'تأكيد الاستلام' : 'Confirm receipt';
}

export function OrderFulfilmentAction({
  locale,
  orderId
}: {
  locale: string;
  orderId: string;
}) {
  const isArabic = locale === 'ar';
  const [order, setOrder] = useState<OrderActivityItem | null>(null);
  const [context, setContext] = useState<OrderPaymentContextResponse | null>(null);
  const [configuration, setConfiguration] =
    useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [selectedAction, setSelectedAction] =
    useState<AvailableFulfilmentAction | null>(null);
  const [carrier, setCarrier] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      getOrderActivityDetail(orderId),
      getOrderPaymentContext(orderId),
      getChallengeConfiguration()
    ])
      .then(([orderResponse, paymentResponse, challengeResponse]) => {
        if (!active) {
          return;
        }
        if (paymentResponse.orderId !== orderResponse.order.id) {
          throw new Error('Order payment context mismatch');
        }
        setOrder(orderResponse.order);
        setContext(paymentResponse);
        setConfiguration(challengeResponse);
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

  const actions = useMemo(
    () => order && context ? availableFulfilmentActions(order, context) : [],
    [order, context]
  );

  if (!order || !context || actions.length === 0) {
    return null;
  }

  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeAction = selectedAction === 'confirm_received'
    ? configuration?.actions.fulfilmentConfirm
    : configuration?.actions.fulfilmentManage;
  const challengeReady =
    !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);

  function openAction(action: AvailableFulfilmentAction) {
    setSelectedAction(action);
    setCarrier('');
    setTrackingReference('');
    setChallengeToken(null);
    setResetKey((value) => value + 1);
    setError(null);
    setSuccess(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedAction ||
      !configuration ||
      configurationError ||
      !challengeReady ||
      submitting
    ) {
      return;
    }

    let input: FulfilmentMutationInput;
    if (selectedAction === 'shipped') {
      const normalizedCarrier = carrier.trim();
      const normalizedTracking = trackingReference.trim();
      if (
        normalizedCarrier.length < 2 ||
        normalizedCarrier.length > 80 ||
        normalizedTracking.length < 3 ||
        normalizedTracking.length > 160
      ) {
        setError(
          isArabic
            ? 'أدخل اسم ناقل من 2 إلى 80 حرفاً ورقم تتبع من 3 إلى 160 حرفاً.'
            : 'Enter a carrier of 2–80 characters and a tracking reference of 3–160 characters.'
        );
        return;
      }
      input = {
        action: 'shipped',
        carrier: normalizedCarrier,
        trackingReference: normalizedTracking
      };
    } else {
      input = { action: selectedAction };
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateOrderFulfilment(
        orderId,
        input,
        challengeToken ?? undefined
      );
      if (!validMutationResponse(response, orderId, selectedAction, input)) {
        throw new Error('Invalid fulfilment response');
      }
      setSuccess(fulfilmentSuccessMessage(
        selectedAction,
        response.fulfilment.unchanged,
        isArabic
      ));
      setSelectedAction(null);
      window.location.reload();
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setChallengeToken(null);
        setResetKey((value) => value + 1);
      }
      setSubmitting(false);
    }
  }

  const currentStatus = context.paymentContext.fulfilment.status;

  return (
    <>
      <section className="order-safety-card order-fulfilment-card">
        <span className="buyer-action-label">
          {isArabic ? 'إدارة الإيفاء' : 'Fulfilment actions'}
        </span>
        <h2>{fulfilmentStatusLabel(currentStatus, isArabic)}</h2>
        <p>
          {isArabic
            ? 'تتوفر هذه الإجراءات فقط بعد التحقق من الدفع وحجزه. لا يؤدي تأكيد الاستلام إلى تحرير الأموال تلقائياً.'
            : 'These actions are available only after payment is verified and held. Confirming receipt never releases funds automatically.'}
        </p>

        {configurationError ? (
          <p className="auth-error" role="alert">
            {isArabic
              ? 'تعذر تحميل إعدادات الأمان. إجراءات الإيفاء متوقفة.'
              : 'Security settings could not be loaded. Fulfilment actions are unavailable.'}
          </p>
        ) : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {success ? <p className="auth-status" role="status">{success}</p> : null}

        <div className="offer-confirmation-actions">
          {actions.map((action) => (
            <button
              className={action === 'confirm_received' ? 'button-primary' : 'button-secondary'}
              type="button"
              key={action}
              disabled={!configuration || configurationError || submitting}
              data-fulfilment-action={action}
              onClick={() => openAction(action)}
            >
              {actionLabel(action, isArabic)}
            </button>
          ))}
        </div>
      </section>

      {selectedAction ? (
        <div
          className="offer-confirmation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-fulfilment-title"
        >
          <form onSubmit={submit}>
            <div>
              <span className="buyer-action-label">
                {isArabic ? 'تأكيد حالة الإيفاء' : 'Confirm fulfilment state'}
              </span>
              <h2 id="order-fulfilment-title">
                {actionLabel(selectedAction, isArabic)}
              </h2>
              <p>
                {selectedAction === 'confirm_received'
                  ? (isArabic
                    ? 'أكد الاستلام فقط بعد استلام السلعة وفحصها. لن يتم تحرير الأموال تلقائياً.'
                    : 'Confirm only after receiving and inspecting the item. Funds will not be released automatically.')
                  : (isArabic
                    ? 'سيتم تسجيل هذه الحالة في سجل الطلب ويمكن للمشتري رؤيتها.'
                    : 'This state will be recorded on the order and visible to the buyer.')}
              </p>
            </div>

            {selectedAction === 'shipped' ? (
              <div className="seller-form-grid">
                <label>
                  <span>{isArabic ? 'شركة الشحن' : 'Carrier'}</span>
                  <input
                    name="carrier"
                    value={carrier}
                    minLength={2}
                    maxLength={80}
                    required
                    autoComplete="off"
                    onChange={(event) => setCarrier(event.target.value)}
                  />
                </label>
                <label>
                  <span>{isArabic ? 'رقم التتبع' : 'Tracking reference'}</span>
                  <input
                    name="trackingReference"
                    value={trackingReference}
                    minLength={3}
                    maxLength={160}
                    required
                    autoComplete="off"
                    onChange={(event) => setTrackingReference(event.target.value)}
                  />
                </label>
              </div>
            ) : null}

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
                data-fulfilment-confirm={selectedAction}
                disabled={
                  !configuration ||
                  configurationError ||
                  !challengeReady ||
                  submitting
                }
              >
                {submitting
                  ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…')
                  : actionLabel(selectedAction, isArabic)}
              </button>
              <button
                className="button-secondary"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setSelectedAction(null);
                  setChallengeToken(null);
                }}
              >
                {isArabic ? 'رجوع' : 'Go back'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
