export default function RegisterPage({ params }: { params: { locale: string } }) {
  const isArabic = params.locale === 'ar';

  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
      </nav>

      <section className="auth-card">
        <div className="eyebrow">{isArabic ? 'إنشاء حساب' : 'Create account'}</div>
        <h1>{isArabic ? 'ابدأ البيع والشراء بثقة' : 'Start buying and selling with trust'}</h1>
        <p>{isArabic ? 'واجهة أولية لإنشاء حساب جديد.' : 'Initial interface for creating a new account.'}</p>
        <div className="form-grid">
          <label>{isArabic ? 'الاسم' : 'Display name'}<input placeholder={isArabic ? 'اسمك' : 'Your name'} /></label>
          <label>{isArabic ? 'البريد الإلكتروني' : 'Email'}<input type="email" placeholder="you@example.com" /></label>
          <label>{isArabic ? 'كلمة المرور' : 'Password'}<input type="password" placeholder="••••••••••" /></label>
          <button className="button-primary" type="button">{isArabic ? 'إنشاء الحساب' : 'Create account'}</button>
        </div>
      </section>
    </main>
  );
}
