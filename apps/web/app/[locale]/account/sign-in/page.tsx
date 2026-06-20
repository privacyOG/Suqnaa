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
            ? 'سيتم ربط هذه الشاشة بطبقة الجلسات الآمنة في الخطوة التالية.'
            : 'This screen will connect to the secure session layer in the next implementation step.'}
        </p>
        <div className="form-grid">
          <label>{isArabic ? 'البريد الإلكتروني' : 'Email'}<input type="email" placeholder="you@example.com" /></label>
          <label>{isArabic ? 'كلمة المرور' : 'Password'}<input type="password" placeholder="••••••••••" /></label>
          <button className="button-primary" type="button">{isArabic ? 'دخول' : 'Sign in'}</button>
        </div>
      </section>
    </main>
  );
}
