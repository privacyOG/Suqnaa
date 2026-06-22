'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  cancelOffer,
  createAcceptedOfferOrder,
  decideOffer,
  getIncomingOffers,
  getMyOffers,
  type OfferWorkflowItem,
  type OfferWorkflowStatus
} from '../lib/offer-workflow-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

type ViewMode = 'incoming' | 'mine';
type PendingAction =
  | { type: 'accept' | 'reject' | 'cancel'; offer: OfferWorkflowItem }
  | { type: 'order'; offer: OfferWorkflowItem };

const statuses: Array<OfferWorkflowStatus | 'all'> = [
  'all',
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'expired'
];

function formatAmount(amount: string | number, currency: string, locale: string): string {
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

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function statusLabel(status: OfferWorkflowStatus, isArabic: boolean): string {
  const values: Record<OfferWorkflowStatus, [string, string]> = {
    pending: ['Pending', 'معلّق'],
    accepted: ['Accepted', 'مقبول'],
    rejected: ['Rejected', 'مرفوض'],
    cancelled: ['Cancelled', 'ملغى'],
    expired: ['Expired', 'منتهي']
  };
  return values[status][isArabic ? 1 : 0];
}

function failureMessage(caught: unknown, isArabic: boolean): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic
        ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.'
        : 'Your account session ended. Sign in again.';
    }
    if (caught.status === 404) {
      return isArabic
        ? 'لم يعد هذا العرض متاحاً لهذا الحساب.'
        : 'This offer is no longer available to this account.';
    }
    if (caught.status === 409) {
      return isArabic
        ? 'تغيّرت حالة العرض أو الإعلان. حدّث القائمة ثم أعد المحاولة.'
        : 'The offer or listing changed. Refresh the list and try again.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `محاولات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many attempts. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
    }
    if (caught.status === 403 || caught.payload.requiresHumanCheck) {
      return isArabic
        ? 'تعذر التحقق من الفحص الأمني. أكمله مرة أخرى.'
        : 'The security check could not be verified. Complete it again.';
    }
  }

  return isArabic
    ? 'تعذر إكمال الإجراء حالياً.'
    : 'The action could not be completed right now.';
}

export function OfferWorkflowPanel({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [mode, setMode] = useState<ViewMode>('incoming');
  const [filter, setFilter] = useState<OfferWorkflowStatus | 'all'>('all');
  const [offers, setOffers] = useState<OfferWorkflowItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer' | 'wallet' | 'xmr'>('card');
  const [submitting, setSubmitting] = useState(false);
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let active = true;
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
  }, []);

  const loadOffers = useCallback(async (cursor?: string) => {
    const append = Boolean(cursor);
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);

    try {
      const options = {
        limit: 20,
        status: filter === 'all' ? undefined : filter,
        before: cursor
      };
      const response = mode === 'incoming'
        ? await getIncomingOffers(options)
        : await getMyOffers(options);
      setOffers((current) => append ? [...current, ...response.offers] : response.offers);
      setHasMore(response.pagination.hasMore);
      setNextCursor(response.pagination.nextCursor);
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
      if (!append) {
        setOffers([]);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [filter, isArabic, mode]);

  useEffect(() => {
    setPendingAction(null);
    setChallengeToken(null);
    void loadOffers();
  }, [loadOffers]);

  const challengeAction = pendingAction?.type === 'order'
    ? configuration?.actions.orderCreate
    : configuration?.actions.offerManage;
  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const challengeReady = !challengeEnabled || Boolean(siteKey && challengeAction && challengeToken);

  const pendingTitle = useMemo(() => {
    if (!pendingAction) {
      return '';
    }
    const titles = {
      accept: isArabic ? 'قبول العرض' : 'Accept offer',
      reject: isArabic ? 'رفض العرض' : 'Reject offer',
      cancel: isArabic ? 'إلغاء العرض' : 'Cancel offer',
      order: isArabic ? 'إنشاء الطلب' : 'Create order'
    };
    return titles[pendingAction.type];
  }, [isArabic, pendingAction]);

  function selectAction(action: PendingAction) {
    setError(null);
    setPendingAction(action);
    setChallengeToken(null);
    setResetKey((value) => value + 1);
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingAction || !configuration || configurationError || !challengeReady || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (pendingAction.type === 'accept' || pendingAction.type === 'reject') {
        await decideOffer(
          pendingAction.offer.id,
          pendingAction.type === 'accept' ? 'accepted' : 'rejected',
          challengeToken ?? undefined
        );
      } else if (pendingAction.type === 'cancel') {
        await cancelOffer(pendingAction.offer.id, challengeToken ?? undefined);
      } else {
        await createAcceptedOfferOrder({
          offerId: pendingAction.offer.id,
          paymentMethod,
          clientOrderId: globalThis.crypto.randomUUID()
        }, challengeToken ?? undefined);
      }

      setPendingAction(null);
      setChallengeToken(null);
      setResetKey((value) => value + 1);
      await loadOffers();
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

  return (
    <section className="offer-workflow">
      <div className="offer-toolbar">
        <div className="offer-tabs" role="tablist" aria-label={isArabic ? 'نوع العروض' : 'Offer view'}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'incoming'}
            className={mode === 'incoming' ? 'offer-tab offer-tab-active' : 'offer-tab'}
            onClick={() => setMode('incoming')}
          >
            {isArabic ? 'العروض الواردة' : 'Incoming offers'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'mine'}
            className={mode === 'mine' ? 'offer-tab offer-tab-active' : 'offer-tab'}
            onClick={() => setMode('mine')}
          >
            {isArabic ? 'عروضي' : 'My offers'}
          </button>
        </div>

        <label className="offer-filter">
          <span>{isArabic ? 'الحالة' : 'Status'}</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as OfferWorkflowStatus | 'all')}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === 'all'
                  ? (isArabic ? 'الكل' : 'All')
                  : statusLabel(status, isArabic)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {configurationError ? (
        <p className="auth-error" role="alert">
          {isArabic
            ? 'تعذر تحميل إعدادات الأمان. العرض متاح لكن الإجراءات متوقفة.'
            : 'Security settings could not be loaded. Offers remain visible, but actions are unavailable.'}
        </p>
      ) : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="auth-status">{isArabic ? 'جارٍ تحميل العروض…' : 'Loading offers…'}</p>
      ) : offers.length === 0 ? (
        <div className="empty-offers">
          <strong>{isArabic ? 'لا توجد عروض هنا' : 'No offers here'}</strong>
          <p>
            {mode === 'incoming'
              ? (isArabic ? 'ستظهر عروض المشترين على إعلاناتك هنا.' : 'Buyer offers on your listings will appear here.')
              : (isArabic ? 'العروض التي ترسلها ستظهر هنا.' : 'Offers you submit will appear here.')}
          </p>
          <a className="button-primary" href={`/${locale}/listings`}>
            {isArabic ? 'تصفح السوق' : 'Browse marketplace'}
          </a>
        </div>
      ) : (
        <div className="offer-card-grid">
          {offers.map((offer) => {
            const counterpart = offer.counterpart?.displayName ?? (isArabic ? 'عضو سوقنا' : 'Suqnaa member');
            return (
              <article className="offer-card" key={offer.id}>
                <div className="offer-card-heading">
                  <div>
                    <span className={`offer-status offer-status-${offer.status}`}>
                      {statusLabel(offer.status, isArabic)}
                    </span>
                    <h2>{offer.listing.title}</h2>
                  </div>
                  <strong>{formatAmount(offer.amount, offer.currencyCode, locale)}</strong>
                </div>

                <dl className="offer-meta">
                  <div>
                    <dt>{mode === 'incoming' ? (isArabic ? 'المشتري' : 'Buyer') : (isArabic ? 'البائع' : 'Seller')}</dt>
                    <dd>{counterpart}</dd>
                  </div>
                  <div>
                    <dt>{isArabic ? 'السعر المطلوب' : 'Asking price'}</dt>
                    <dd>{formatAmount(offer.listing.priceAmount, offer.listing.currencyCode, locale)}</dd>
                  </div>
                  <div>
                    <dt>{isArabic ? 'آخر تحديث' : 'Updated'}</dt>
                    <dd>{formatDate(offer.updatedAt, locale)}</dd>
                  </div>
                </dl>

                {offer.message ? <p className="offer-note">{offer.message}</p> : null}

                {offer.order ? (
                  <div className="offer-order-summary">
                    <strong>{isArabic ? 'تم إنشاء الطلب' : 'Order created'}</strong>
                    <span>{isArabic ? `الحالة: ${offer.order.status}` : `Status: ${offer.order.status}`}</span>
                    <span>{isArabic ? `طريقة الدفع: ${offer.order.paymentMethod ?? '—'}` : `Payment method: ${offer.order.paymentMethod ?? '—'}`}</span>
                  </div>
                ) : null}

                <div className="offer-card-actions">
                  <a className="button-secondary" href={`/${locale}/listings/${offer.listing.id}`}>
                    {isArabic ? 'عرض الإعلان' : 'View listing'}
                  </a>
                  {mode === 'incoming' && offer.status === 'pending' ? (
                    <>
                      <button className="button-primary" type="button" onClick={() => selectAction({ type: 'accept', offer })}>
                        {isArabic ? 'قبول' : 'Accept'}
                      </button>
                      <button className="button-secondary danger-button" type="button" onClick={() => selectAction({ type: 'reject', offer })}>
                        {isArabic ? 'رفض' : 'Reject'}
                      </button>
                    </>
                  ) : null}
                  {mode === 'mine' && offer.status === 'pending' ? (
                    <button className="button-secondary danger-button" type="button" onClick={() => selectAction({ type: 'cancel', offer })}>
                      {isArabic ? 'إلغاء العرض' : 'Cancel offer'}
                    </button>
                  ) : null}
                  {mode === 'mine' && offer.status === 'accepted' && !offer.order ? (
                    <button className="button-primary" type="button" onClick={() => selectAction({ type: 'order', offer })}>
                      {isArabic ? 'إنشاء الطلب' : 'Create order'}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasMore && nextCursor ? (
        <button
          className="button-secondary load-more-button"
          type="button"
          disabled={loadingMore}
          onClick={() => void loadOffers(nextCursor)}
        >
          {loadingMore ? (isArabic ? 'جارٍ التحميل…' : 'Loading…') : (isArabic ? 'تحميل المزيد' : 'Load more')}
        </button>
      ) : null}

      {pendingAction ? (
        <div className="offer-confirmation" role="dialog" aria-modal="true" aria-labelledby="offer-confirmation-title">
          <form onSubmit={submitAction}>
            <div>
              <span className="buyer-action-label">{isArabic ? 'تأكيد الإجراء' : 'Confirm action'}</span>
              <h2 id="offer-confirmation-title">{pendingTitle}</h2>
              <p>
                {pendingAction.type === 'accept'
                  ? (isArabic ? 'سيتم حجز الإعلان لهذا المشتري ورفض العروض المعلّقة الأخرى.' : 'The listing will be reserved for this buyer and other pending offers will be rejected.')
                  : pendingAction.type === 'order'
                    ? (isArabic ? 'سيتم إنشاء الطلب من العرض المقبول فقط، باستخدام السعر والعملات المحفوظة.' : 'The order will be created only from the accepted offer using its stored amount and currency.')
                    : (isArabic ? 'لا يمكن التراجع عن هذا الإجراء من هذه الشاشة.' : 'This action cannot be reversed from this screen.')}
              </p>
            </div>

            {pendingAction.type === 'order' ? (
              <label className="offer-payment-field">
                <span>{isArabic ? 'طريقة الدفع' : 'Payment method'}</span>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>
                  <option value="card">{isArabic ? 'بطاقة' : 'Card'}</option>
                  <option value="bank_transfer">{isArabic ? 'تحويل بنكي' : 'Bank transfer'}</option>
                  <option value="wallet">{isArabic ? 'محفظة' : 'Wallet'}</option>
                  <option value="xmr">XMR</option>
                </select>
              </label>
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
                    setError(isArabic ? 'تعذر إكمال الفحص الأمني.' : 'The security check could not be completed.');
                  }}
                />
              </>
            ) : null}

            <div className="offer-confirmation-actions">
              <button
                className="button-primary"
                type="submit"
                disabled={!configuration || configurationError || !challengeReady || submitting}
              >
                {submitting ? (isArabic ? 'جارٍ التنفيذ…' : 'Processing…') : pendingTitle}
              </button>
              <button
                className="button-secondary"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setPendingAction(null);
                  setChallengeToken(null);
                }}
              >
                {isArabic ? 'رجوع' : 'Back'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
