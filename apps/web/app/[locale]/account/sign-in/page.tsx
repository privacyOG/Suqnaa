import { AccountAuthForm } from '../../../../components/account-auth-form';

export default function SignInPage({ params }: { params: { locale: string } }) {
  const isArabic = params.locale === 'ar';

  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
      </nav>

      <section className="auth-card">
        <div className="eyebrow">{isArabic ? 'تسجيل الدخول' : 'Sign in'}</div>
        <h1>{isArabic ? 'ادخل إلى حسابك' : 'Access your account'}</h1>
        <p>
          {isArabic
            ? 'سجّل الدخول عبر جلسة آمنة مع فحص تلقائي ضد النشاط الآلي الضار.'
            : 'Sign in through a secure session with automated abuse protection.'}
        </p>
        <AccountAuthForm locale={params.locale} mode="login" />
      </section>
    </main>
  );
}
