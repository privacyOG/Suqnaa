import { notFound } from 'next/navigation';
import { NotificationCentre } from '../../../components/notification-centre';
import { SessionRefresh } from '../../../components/session-refresh';
import { isLocale } from '../../../i18n/locales';
import { loadAccountSessionState } from '../../../lib/account-session-state';

export default async function NotificationsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const ar = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/listings`}>{ar ? 'السوق' : 'Marketplace'}</a>
          <a href={`/${params.locale}/messages`}>{ar ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/activity`}>{ar ? 'العروض والطلبات' : 'Offers and orders'}</a>
          <a href={`/${params.locale}/account`}>{ar ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="offers-page-header">
        <div>
          <div className="eyebrow">{ar ? 'الإشعارات' : 'Notifications'}</div>
          <h1>{ar ? 'تابع نشاط السوق وأمان حسابك' : 'Track marketplace and account activity'}</h1>
          <p>
            {ar
              ? 'راجع إشعارات الرسائل والعروض والطلبات والمدفوعات والتسليم والنزاعات وأحداث أمان الحساب، واضبط قنوات البريد وSMS والإشعارات الفورية.'
              : 'Review message, offer, order, payment, fulfilment, dispute, and account-security events, and manage email, SMS, and push delivery preferences.'}
          </p>
        </div>
        {user ? (
          <div className="seller-identity-card">
            <span>{ar ? 'الحساب' : 'Account'}</span>
            <strong>{user.display_name}</strong>
            <small>{ar ? `الحالة: ${user.status}` : `Status: ${user.status}`}</small>
          </div>
        ) : null}
      </header>

      {user ? (
        <NotificationCentre locale={params.locale} />
      ) : needsRotation ? (
        <div className="seller-session-panel"><SessionRefresh locale={params.locale} /></div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {ar ? 'سجّل الدخول لعرض الإشعارات.' : 'Sign in to view notifications.'}
          </p>
          <div className="actions">
            <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
              {ar ? 'تسجيل الدخول' : 'Sign in'}
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
