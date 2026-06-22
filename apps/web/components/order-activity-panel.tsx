'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getOrderActivity,
  getOrderActivityDetail,
  type OrderActivityItem,
  type OrderActivityStatus,
  type OrderProgressStage,
  type OrderProgressStepKey
} from '../lib/order-activity-api';

const statuses: Array<OrderActivityStatus | 'all'> = [
  'all',
  'pending',
  'paid',
  'released',
  'disputed',
  'refunded',
  'cancelled'
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

function statusLabel(status: OrderActivityStatus, isArabic: boolean): string {
  const labels: Record<OrderActivityStatus, [string, string]> = {
    pending: ['Payment pending', 'بانتظار الدفع'],
    paid: ['Paid', 'مدفوع'],
    released: ['Complete', 'مكتمل'],
    disputed: ['Disputed', 'متنازع عليه'],
    refunded: ['Refunded', 'مسترد'],
    cancelled: ['Cancelled', 'ملغى']
  };
  return labels[status][isArabic ? 1 : 0];
}

function stageLabel(stage: OrderProgressStage, isArabic: boolean): string {
  const labels: Record<OrderProgressStage, [string, string]> = {
    payment_pending: ['Waiting for payment confirmation', 'بانتظار تأكيد الدفع'],
    fulfilment: ['Preparing handover or delivery', 'جارٍ تجهيز التسليم أو التوصيل'],
    complete: ['Transaction complete', 'اكتملت المعاملة'],
    disputed: ['Resolution required', 'تحتاج إلى تسوية'],
    refunded: ['Funds returned', 'تمت إعادة الأموال'],
    cancelled: ['Transaction cancelled', 'ألغيت المعاملة']
  };
  return labels[stage][isArabic ? 1 : 0];
}

function stepLabel(step: OrderProgressStepKey, isArabic: boolean): string {
  const labels: Record<OrderProgressStepKey, [string, string]> = {
    created: ['Order created', 'تم إنشاء الطلب'],
    paid: ['Payment confirmed', 'تم تأكيد الدفع'],
    fulfilment: ['Handover or delivery', 'التسليم أو التوصيل'],
    complete: ['Complete', 'مكتمل']
  };
  return labels[step][isArabic ? 1 : 0];
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
        : 'This order is not available to this account.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `طلبات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many requests. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
    }
  }

  return isArabic
    ? 'تعذر تحميل بيانات الطلب حالياً.'
    : 'Order information could not be loaded right now.';
}

function OrderProgress({ order, locale }: { order: OrderActivityItem; locale: string }) {
  const isArabic = locale === 'ar';

  return (
    <section className="order-progress" aria-label={isArabic ? 'تقدم الطلب' : 'Order progress'}>
      <div className="order-progress-heading">
        <div>
          <span>{isArabic ? 'التقدم' : 'Progress'}</span>
          <strong>{stageLabel(order.progress.stage, isArabic)}</strong>
        </div>
        <b>{order.progress.percent}%</b>
      </div>
      <div className="order-progress-track" aria-hidden="true">
        <span style={{ width: `${order.progress.percent}%` }} />
      </div>
      <ol className="order-progress-steps">
        {order.progress.steps.map((step) => (
          <li className={`order-progress-step order-progress-step-${step.state}`} key={step.key}>
            <span aria-hidden="true" />
            <strong>{stepLabel(step.key, isArabic)}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function OrderActivityList({ locale }: { locale: string }) {
  const isArabic = locale === 'ar';
  const [filter, setFilter] = useState<OrderActivityStatus | 'all'>('all');
  const [orders, setOrders] = useState<OrderActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async (cursor?: string) => {
    const append = Boolean(cursor);
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);

    try {
      const response = await getOrderActivity({
        status: filter === 'all' ? undefined : filter,
        limit: 20,
        before: cursor
      });
      setOrders((current) => append ? [...current, ...response.orders] : response.orders);
      setHasMore(response.pagination.hasMore);
      setNextCursor(response.pagination.nextCursor);
    } catch (caught) {
      setError(failureMessage(caught, isArabic));
      if (!append) {
        setOrders([]);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [filter, isArabic]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <section className="order-activity-shell">
      <div className="offer-toolbar">
        <strong>{isArabic ? 'سجل الطلبات' : 'Order history'}</strong>
        <label className="offer-filter">
          <span>{isArabic ? 'الحالة' : 'Status'}</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as OrderActivityStatus | 'all')}
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

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="auth-status">{isArabic ? 'جارٍ تحميل الطلبات…' : 'Loading orders…'}</p>
      ) : orders.length === 0 ? (
        <div className="empty-offers">
          <strong>{isArabic ? 'لا توجد طلبات بعد' : 'No orders yet'}</strong>
          <p>
            {isArabic
              ? 'ستظهر هنا الطلبات التي تشتريها أو تبيعها.'
              : 'Orders where you are the buyer or seller will appear here.'}
          </p>
          <a className="button-primary" href={`/${locale}/activity`}>
            {isArabic ? 'العودة إلى العروض' : 'Return to offers'}
          </a>
        </div>
      ) : (
        <div className="order-card-grid">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="offer-card-heading">
                <div>
                  <span className={`offer-status offer-status-${order.status}`}>
                    {statusLabel(order.status, isArabic)}
                  </span>
                  <h2>{order.listing?.title ?? (isArabic ? 'إعلان غير متاح' : 'Listing unavailable')}</h2>
                </div>
                <strong>{formatAmount(order.amount, order.currencyCode, locale)}</strong>
              </div>

              <dl className="offer-meta">
                <div>
                  <dt>{isArabic ? 'دورك' : 'Your role'}</dt>
                  <dd>{order.role === 'buyer' ? (isArabic ? 'المشتري' : 'Buyer') : (isArabic ? 'البائع' : 'Seller')}</dd>
                </div>
                <div>
                  <dt>{order.role === 'buyer' ? (isArabic ? 'البائع' : 'Seller') : (isArabic ? 'المشتري' : 'Buyer')}</dt>
                  <dd>{order.counterpart?.displayName ?? (isArabic ? 'عضو سوقنا' : 'Suqnaa member')}</dd>
                </div>
                <div>
                  <dt>{isArabic ? 'آخر تحديث' : 'Updated'}</dt>
                  <dd>{formatDate(order.updatedAt, locale)}</dd>
                </div>
              </dl>

              <div className="order-card-progress">
                <span>{stageLabel(order.progress.stage, isArabic)}</span>
                <div aria-hidden="true"><b style={{ width: `${order.progress.percent}%` }} /></div>
              </div>

              <div className="offer-card-actions">
                <a className="button-primary" href={`/${locale}/activity/orders/${order.id}`}>
                  {isArabic ? 'عرض تفاصيل الطلب' : 'View order details'}
                </a>
                {order.listing ? (
                  <a className="button-secondary" href={`/${locale}/listings/${order.listing.id}`}>
                    {isArabic ? 'عرض الإعلان' : 'View listing'}
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {hasMore && nextCursor ? (
        <button
          className="button-secondary load-more-button"
          type="button"
          disabled={loadingMore}
          onClick={() => void loadOrders(nextCursor)}
        >
          {loadingMore ? (isArabic ? 'جارٍ التحميل…' : 'Loading…') : (isArabic ? 'تحميل المزيد' : 'Load more')}
        </button>
      ) : null}
    </section>
  );
}

export function OrderActivityDetail({ locale, orderId }: { locale: string; orderId: string }) {
  const isArabic = locale === 'ar';
  const [order, setOrder] = useState<OrderActivityItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getOrderActivityDetail(orderId)
      .then((response) => {
        if (active) {
          setOrder(response.order);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(failureMessage(caught, isArabic));
        }
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

  if (loading) {
    return <p className="auth-status">{isArabic ? 'جارٍ تحميل الطلب…' : 'Loading order…'}</p>;
  }

  if (error || !order) {
    return (
      <section className="empty-offers">
        <strong>{isArabic ? 'تعذر عرض الطلب' : 'Order unavailable'}</strong>
        <p className="auth-error" role="alert">{error}</p>
        <a className="button-primary" href={`/${locale}/activity/orders`}>
          {isArabic ? 'العودة إلى الطلبات' : 'Return to orders'}
        </a>
      </section>
    );
  }

  return (
    <section className="order-detail-shell">
      <article className="order-detail-card">
        <div className="offer-card-heading">
          <div>
            <span className={`offer-status offer-status-${order.status}`}>
              {statusLabel(order.status, isArabic)}
            </span>
            <h2>{order.listing?.title ?? (isArabic ? 'إعلان غير متاح' : 'Listing unavailable')}</h2>
          </div>
          <strong>{formatAmount(order.amount, order.currencyCode, locale)}</strong>
        </div>

        <dl className="order-detail-facts">
          <div>
            <dt>{isArabic ? 'رقم الطلب' : 'Order ID'}</dt>
            <dd>{order.id}</dd>
          </div>
          <div>
            <dt>{isArabic ? 'دورك' : 'Your role'}</dt>
            <dd>{order.role === 'buyer' ? (isArabic ? 'المشتري' : 'Buyer') : (isArabic ? 'البائع' : 'Seller')}</dd>
          </div>
          <div>
            <dt>{order.role === 'buyer' ? (isArabic ? 'البائع' : 'Seller') : (isArabic ? 'المشتري' : 'Buyer')}</dt>
            <dd>{order.counterpart?.displayName ?? (isArabic ? 'عضو سوقنا' : 'Suqnaa member')}</dd>
          </div>
          <div>
            <dt>{isArabic ? 'طريقة الدفع' : 'Payment method'}</dt>
            <dd>{paymentMethodLabel(order.paymentMethod, isArabic)}</dd>
          </div>
          <div>
            <dt>{isArabic ? 'تم الإنشاء' : 'Created'}</dt>
            <dd>{formatDate(order.createdAt, locale)}</dd>
          </div>
          <div>
            <dt>{isArabic ? 'آخر تحديث' : 'Last updated'}</dt>
            <dd>{formatDate(order.updatedAt, locale)}</dd>
          </div>
        </dl>

        {order.offer?.message ? (
          <div className="offer-note">
            <strong>{isArabic ? 'رسالة العرض' : 'Offer message'}</strong>
            <p>{order.offer.message}</p>
          </div>
        ) : null}

        <OrderProgress order={order} locale={locale} />

        <div className="offer-card-actions">
          <a className="button-secondary" href={`/${locale}/activity/orders`}>
            {isArabic ? 'العودة إلى الطلبات' : 'Back to orders'}
          </a>
          {order.listing ? (
            <a className="button-primary" href={`/${locale}/listings/${order.listing.id}`}>
              {isArabic ? 'عرض الإعلان' : 'View listing'}
            </a>
          ) : null}
        </div>
      </article>

      <aside className="order-safety-card">
        <span className="buyer-action-label">{isArabic ? 'حماية المعاملة' : 'Transaction safety'}</span>
        <h2>{isArabic ? 'ابقَ داخل سوقنا' : 'Keep the transaction inside Suqnaa'}</h2>
        <p>
          {isArabic
            ? 'لا تشارك كلمات المرور أو رموز التحقق. استخدم الرسائل وسجل الطلب لحفظ الأدلة.'
            : 'Never share passwords or verification codes. Keep messages and order records inside Suqnaa.'}
        </p>
      </aside>
    </section>
  );
}
