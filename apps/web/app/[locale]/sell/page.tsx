import { notFound } from 'next/navigation';
import { SellListingForm } from '../../../components/sell-listing-form';
import { SessionRefresh } from '../../../components/session-refresh';
import { isLocale } from '../../../i18n/locales';
import { loadAccountSessionState } from '../../../lib/account-session-state';

export default async function SellPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/sell/manage`}>{isArabic ? 'إعلاناتي' : 'My listings'}</a>
          <a href={`/${params.locale}/messages`}>{isArabic ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <section className="auth-card listing-editor-card">
        <div className="eyebrow">{isArabic ? 'بيع' : 'Sell'}</div>
        <h1>{isArabic ? 'أنشئ إعلاناً موثوقاً' : 'Create a trusted listing'}</h1>
        <p>
          {isArabic
            ? 'أضف تفاصيل واضحة واحفظ الإعلان كمسودة. يمكنك مراجعته ثم نشره من صفحة إعلاناتي.'
            : 'Add clear details and save the listing as a draft. Review and publish it from My listings.'}
        </p>

        {user ? (
          <>
            <div className="seller-session-summary">
              <span>{isArabic ? 'البائع' : 'Seller'}</span>
              <strong>{user.display_name}</strong>
              <small>{isArabic ? `حالة الحساب: ${user.status}` : `Account status: ${user.status}`}</small>
            </div>
            <SellListingForm locale={params.locale} />
          </>
        ) : needsRotation ? (
          <SessionRefresh locale={params.locale} />
        ) : (
          <div className="signed-out-panel">
            <p className="auth-error">
              {isArabic
                ? 'سجّل الدخول قبل إنشاء إعلان.'
                : 'Sign in before creating a listing.'}
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
      </section>
    </main>
  );
}
