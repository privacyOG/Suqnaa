import { notFound } from 'next/navigation';
import { OfferWorkflowPanel } from '../../../components/offer-workflow-panel';
import { SessionRefresh } from '../../../components/session-refresh';
import { isLocale } from '../../../i18n/locales';
import { loadAccountSessionState } from '../../../lib/account-session-state';

export default async function ActivityPage({ params }: { params: { locale: string } }) {
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
          <a href={`/${params.locale}/listings`}>{isArabic ? 'السوق' : 'Marketplace'}</a>
          <a href={`/${params.locale}/sell/manage`}>{isArabic ? 'إعلاناتي' : 'My listings'}</a>
          <a href={`/${params.locale}/messages`}>{isArabic ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="offers-page-header">
        <div>
          <div className="eyebrow">{isArabic ? 'العروض والطلبات' : 'Offers and orders'}</div>
          <h1>{isArabic ? 'أدر عروض البيع والشراء بأمان' : 'Manage buying and selling offers securely'}</h1>
          <p>
            {isArabic
              ? 'راجع العروض الواردة على إعلاناتك، تابع عروضك، وأنشئ طلباً فقط بعد قبول البائع.'
              : 'Review offers on your listings, track offers you made, and create an order only after seller acceptance.'}
          </p>
          <div className="actions">
            <a className="button-primary" href={`/${params.locale}/activity/orders`}>
              {isArabic ? 'عرض سجل الطلبات' : 'View order history'}
            </a>
          </div>
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
        <OfferWorkflowPanel locale={params.locale} />
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic
              ? 'سجّل الدخول لعرض العروض والطلبات.'
              : 'Sign in to view offers and orders.'}
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
