import { notFound } from 'next/navigation';
import { isLocale } from '../../../i18n/locales';

export default function AccountPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';

  return (
    <main className="page-shell">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${isArabic ? 'en' : 'ar'}/account`}>{isArabic ? 'English' : 'العربية'}</a>
      </nav>

      <section className="hero account-hero">
        <div>
          <div className="eyebrow">{isArabic ? 'الحساب' : 'Account'}</div>
          <h1>{isArabic ? 'إدارة حسابك بأمان' : 'Manage your account securely'}</h1>
          <p>
            {isArabic
              ? 'سجّل الدخول، احفظ جلسة الحساب، واستخدم رمز الوصول للطلبات المحمية داخل التطبيق.'
              : 'Sign in, keep the account session, and use the access token for protected app requests.'}
          </p>
          <div className="actions">
            <a className="button-primary" href={`/${params.locale}/account/sign-in`}>{isArabic ? 'تسجيل الدخول' : 'Sign in'}</a>
            <a className="button-secondary" href={`/${params.locale}/account/register`}>{isArabic ? 'إنشاء حساب' : 'Create account'}</a>
          </div>
        </div>

        <aside className="phone-card">
          <div className="phone-screen">
            <div className="mobile-header">
              <span>{isArabic ? 'جلسة آمنة' : 'Secure session'}</span>
              <span>✓</span>
            </div>
            <div className="assistant-card">
              <strong>{isArabic ? 'ما التالي؟' : 'Next foundation'}</strong>
              <p>{isArabic ? 'ربط شاشات البيع والملف الشخصي بالحساب.' : 'Connect listing and profile screens to the account session.'}</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
