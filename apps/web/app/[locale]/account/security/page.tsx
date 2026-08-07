import { notFound } from 'next/navigation';
import { AccountSecurityPanel } from '../../../../components/account-security-panel';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';

export default async function AccountSecurityPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}/account`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${isArabic ? 'en' : 'ar'}/account/security`}>
          {isArabic ? 'English' : 'العربية'}
        </a>
      </nav>
      <section className="auth-card">
        <div className="eyebrow">{isArabic ? 'أمان الحساب' : 'Account security'}</div>
        <h1>{isArabic ? 'كلمة المرور والجلسات' : 'Password and sessions'}</h1>
        {!user ? (
          <div className="form-grid">
            <p className="auth-error">
              {needsRotation
                ? (isArabic ? 'جدّد جلسة الحساب من صفحة الحساب ثم أعد المحاولة.' : 'Refresh your account session from the account page, then try again.')
                : (isArabic ? 'سجّل الدخول لإدارة أمان الحساب.' : 'Sign in to manage account security.')}
            </p>
            <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
              {isArabic ? 'تسجيل الدخول' : 'Sign in'}
            </a>
          </div>
        ) : (
          <AccountSecurityPanel locale={params.locale} />
        )}
      </section>
    </main>
  );
}
