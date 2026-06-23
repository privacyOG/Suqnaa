import { notFound } from 'next/navigation';
import { OrderActivityDetail } from '../../../../../components/order-activity-panel';
import { SessionRefresh } from '../../../../../components/session-refresh';
import { isLocale } from '../../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../../lib/account-session-state';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OrderDetailPage({
  params,
  searchParams
}: {
  params: { locale: string; orderId: string };
  searchParams: { redirect_status?: string; paid?: string };
}) {
  if (!isLocale(params.locale) || !uuidPattern.test(params.orderId)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();
  const paymentSucceeded = searchParams.redirect_status === 'succeeded' || searchParams.paid === '1';

  return (
    <main className="page-shell offers-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/activity/orders`}>{isArabic ? 'الطلبات' : 'Orders'}</a>
          <a href={`/${params.locale}/activity`}>{isArabic ? 'العروض' : 'Offers'}</a>
          <a href={`/${params.locale}/messages`}>{isArabic ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="offers-page-header">
        <div>
          <div className="eyebrow">{isArabic ? 'تفاصيل الطلب' : 'Order details'}</div>
          <h1>{isArabic ? 'حالة الدفع والتسليم' : 'Payment and fulfilment status'}</h1>
          <p>
            {isArabic
              ? 'يعرض هذا السجل فقط للمشتري والبائع المشاركين في الطلب.'
              : 'This record is visible only to the buyer and seller participating in the order.'}
          </p>
        </div>
      </header>

      {paymentSucceeded ? (
        <div className="buyer-session-panel" style={{ borderColor: '#22c55e', background: '#f0fdf4' }}>
          <strong style={{ color: '#16a34a' }}>
            {isArabic ? 'تم استلام الدفع' : 'Payment received'}
          </strong>
          <p>
            {isArabic
              ? 'تم تأكيد دفعتك وسيتم تحديث حالة الطلب قريباً.'
              : 'Your payment has been confirmed and the order status will update shortly.'}
          </p>
        </div>
      ) : null}

      {user ? (
        <OrderActivityDetail locale={params.locale} orderId={params.orderId} />
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic
              ? 'سجّل الدخول لعرض تفاصيل الطلب.'
              : 'Sign in to view order details.'}
          </p>
          <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
            {isArabic ? 'تسجيل الدخول' : 'Sign in'}
          </a>
        </div>
      )}
    </main>
  );
}
