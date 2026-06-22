import { notFound } from 'next/navigation';
import { MyListingsPanel } from '../../../../components/my-listings-panel';
import { SessionRefresh } from '../../../../components/session-refresh';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';

export default async function ManageListingsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell seller-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/sell`}>{isArabic ? 'إعلان جديد' : 'New listing'}</a>
          <a href={`/${params.locale}/activity`}>{isArabic ? 'العروض والطلبات' : 'Offers and orders'}</a>
          <a href={`/${params.locale}/messages`}>{isArabic ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="seller-page-header">
        <div>
          <div className="eyebrow">{isArabic ? 'لوحة البائع' : 'Seller dashboard'}</div>
          <h1>{isArabic ? 'إدارة إعلاناتك' : 'Manage your listings'}</h1>
          <p>
            {isArabic
              ? 'راجع المسودات، انشر الإعلانات، وحدّث حالة المنتجات من مكان واحد.'
              : 'Review drafts, publish listings, and update item availability from one place.'}
          </p>
        </div>
        {user ? (
          <div className="seller-identity-card">
            <span>{isArabic ? 'البائع' : 'Seller'}</span>
            <strong>{user.display_name}</strong>
            <small>{isArabic ? `حالة الحساب: ${user.status}` : `Account status: ${user.status}`}</small>
          </div>
        ) : null}
      </header>

      {user ? (
        <MyListingsPanel locale={params.locale} />
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic
              ? 'سجّل الدخول لعرض إعلاناتك.'
              : 'Sign in to view your listings.'}
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
