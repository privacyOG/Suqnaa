import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { SignOutButton } from '../../../components/sign-out-button';
import { isLocale } from '../../../i18n/locales';

interface CurrentUser {
  id: string;
  email: string | null;
  phone_e164: string | null;
  display_name: string;
  status: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
}

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

async function loadCurrentUser(): Promise<CurrentUser | null> {
  const accessToken = cookies().get('suqnaa_access')?.value;
  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/v1/account/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as { user: CurrentUser };
    return payload.user;
  } catch {
    return null;
  }
}

export default async function AccountPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const user = await loadCurrentUser();

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
              : (isArabic ? 'إدارة حسابك بأمان' : 'Manage your account securely')}
          </h1>
          <p>
            {user
              ? (isArabic
                  ? `جلستك آمنة وحالة الحساب: ${user.status}.`
                  : `Your secure session is active. Account status: ${user.status}.`)
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
              <span>{user ? '✓' : '○'}</span>
            </div>
            <div className="assistant-card">
              <strong>
                {user
                  ? (isArabic ? 'تم تسجيل الدخول' : 'Signed in')
                  : (isArabic ? 'ابدأ من هنا' : 'Start here')}
              </strong>
              <p>
                {user
                  ? (user.email ?? user.phone_e164 ?? user.id)
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
