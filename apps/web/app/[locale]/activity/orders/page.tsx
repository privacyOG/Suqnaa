import { notFound } from 'next/navigation';
import { OrderActivityList } from '../../../../components/order-activity-panel';
import { SessionRefresh } from '../../../../components/session-refresh';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';

export default async function OrderActivityPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell offers-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/activity`}>{isArabic ? 'العروض' : 'Offers'}</a>
          <a href={`/${params.locale}/listings`}>{isArabic ? 'السوق' : 'Marketplace'}</a>
          <a href={`/${params.locale}/messages`}>{isArabic ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="offers-page-header">
        <div>
          <div className="eyebrow">{isArabic ? 'سجل المعاملات' : 'Transaction history'}</div>
          <h1>{isArabic ? 'تابع طلبات الشراء والبيع' : 'Track your buying and selling orders'}</h1>
          <p>
            {isArabic
              ? 'راجع حالة الدفع والتسليم لكل طلب تشارك فيه كمشترٍ أو بائع.'
              : 'Review payment and fulfilment progress for every order where you are the buyer or seller.'}
          </p>
        </div>
        {user ? (
          <div className="seller-identity-card">
            <span>{isArabic ? 'الحساب' : 'Account'}</span>
            <strong>{user.display_name}</strong>
            <small>{isArabic ? `الحالة: ${user.status}` : `Status: ${user.status}`}</small>
          </div>
        ) : null}
      </header>

      {user ? (
        <OrderActivityList locale={params.locale} />
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic
              ? 'سجّل الدخول لعرض سجل الطلبات.'
              : 'Sign in to view your order history.'}
          </p>
          <div className="actions">
            <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
              {isArabic ? 'تسجيل الدخول' : 'Sign in'}
            </a>
            <a className="button-secondary" href={`/${params.locale}/account/register`}>
              {isArabic ? 'إنشاء حساب' : 'Create account'}
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
