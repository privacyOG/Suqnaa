import { notFound } from 'next/navigation';
import { SessionRefresh } from '../../../components/session-refresh';
import { SignOutButton } from '../../../components/sign-out-button';
import { isLocale } from '../../../i18n/locales';
import { loadAccountSessionState } from '../../../lib/account-session-state';

export default async function AccountPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${isArabic ? 'en' : 'ar'}/account`}>{isArabic ? 'English' : 'العربية'}</a>
      </nav>

      <section className="hero account-hero">
        <div>
          <div className="eyebrow">{isArabic ? 'الحساب' : 'Account'}</div>
          <h1>
            {user
              ? (isArabic ? `مرحباً، ${user.display_name}` : `Welcome, ${user.display_name}`)
              : needsRotation
                ? (isArabic ? 'جارٍ استعادة حسابك' : 'Restoring your account')
                : (isArabic ? 'إدارة حسابك بأمان' : 'Manage your account securely')}
          </h1>
          <p>
            {user
              ? (isArabic
                  ? `جلستك آمنة وحالة الحساب: ${user.status}.`
                  : `Your secure session is active. Account status: ${user.status}.`)
              : needsRotation
                ? (isArabic
                    ? 'يتم الآن تجديد جلسة الحساب.'
                    : 'Your account session is being renewed now.')
                : (isArabic
                    ? 'سجّل الدخول أو أنشئ حساباً للوصول إلى الطلبات المحمية.'
                    : 'Sign in or create an account to access protected marketplace requests.')}
          </p>
          <div className="actions">
            {user ? (
              <>
                <a className="button-primary" href={`/${params.locale}/sell`}>
                  {isArabic ? 'إنشاء إعلان' : 'Create listing'}
                </a>
                <SignOutButton locale={params.locale} />
              </>
            ) : needsRotation ? (
              <SessionRefresh locale={params.locale} />
            ) : (
              <>
                <a className="button-primary" href={`/${params.locale}/account/sign-in`}>{isArabic ? 'تسجيل الدخول' : 'Sign in'}</a>
                <a className="button-secondary" href={`/${params.locale}/account/register`}>{isArabic ? 'إنشاء حساب' : 'Create account'}</a>
              </>
            )}
          </div>
        </div>

        <aside className="phone-card">
          <div className="phone-screen">
            <div className="mobile-header">
              <span>{isArabic ? 'جلسة آمنة' : 'Secure session'}</span>
              <span>{user ? '✓' : needsRotation ? '…' : '○'}</span>
            </div>
            <div className="assistant-card">
              <strong>
                {user
                  ? (isArabic ? 'تم تسجيل الدخول' : 'Signed in')
                  : needsRotation
                    ? (isArabic ? 'استعادة الجلسة' : 'Restoring session')
                    : (isArabic ? 'ابدأ من هنا' : 'Start here')}
              </strong>
              <p>
                {user
                  ? (user.email ?? user.phone_e164 ?? user.id)
                  : needsRotation
                    ? (isArabic
                        ? 'سيتم تحديث الصفحة تلقائياً عند اكتمال الاستعادة.'
                        : 'This page will update automatically when restoration completes.')
                    : (isArabic
                        ? 'استخدم الفحص الأمني لحماية إنشاء الحساب وتسجيل الدخول.'
                        : 'Human verification protects registration and sign-in from automated abuse.')}
              </p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
