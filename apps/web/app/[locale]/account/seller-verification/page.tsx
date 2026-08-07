import { notFound } from 'next/navigation';
import { SellerVerificationPanel } from '../../../../components/seller-verification-panel';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';

export default async function SellerVerificationPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}/account`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${isArabic ? 'en' : 'ar'}/account/seller-verification`}>
          {isArabic ? 'English' : 'العربية'}
        </a>
      </nav>
      <section className="auth-card">
        <div className="eyebrow">{isArabic ? 'ثقة البائع' : 'Seller trust'}</div>
        <h1>{isArabic ? 'التحقق من البائع أو النشاط التجاري' : 'Seller or business verification'}</h1>
        <p>
          {isArabic
            ? 'ابدأ جلسة تحقق محمية، تابع حالتها، وأعد التحقق عند انتهاء الصلاحية.'
            : 'Start a protected verification session, track its status, and renew it when required.'}
        </p>
        {!user ? (
          <div className="form-grid">
            <p className="auth-error">
              {needsRotation
                ? (isArabic ? 'جدّد جلسة الحساب ثم أعد المحاولة.' : 'Refresh your account session, then try again.')
                : (isArabic ? 'سجّل الدخول لإدارة تحقق البائع.' : 'Sign in to manage seller verification.')}
            </p>
            <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
              {isArabic ? 'تسجيل الدخول' : 'Sign in'}
            </a>
          </div>
        ) : (
          <SellerVerificationPanel locale={params.locale} />
        )}
      </section>
    </main>
  );
}
