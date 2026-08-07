import { ForgotPasswordForm } from '../../../../components/forgot-password-form';

export default function ForgotPasswordPage({ params }: { params: { locale: string } }) {
  const isArabic = params.locale === 'ar';
  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${params.locale}/account/sign-in`}>{isArabic ? 'تسجيل الدخول' : 'Sign in'}</a>
      </nav>
      <section className="auth-card">
        <div className="eyebrow">{isArabic ? 'استعادة الحساب' : 'Account recovery'}</div>
        <h1>{isArabic ? 'نسيت كلمة المرور؟' : 'Forgot your password?'}</h1>
        <p>
          {isArabic
            ? 'أدخل بريدك الإلكتروني. لأسباب أمنية، ستكون الاستجابة نفسها سواء كان الحساب موجوداً أم لا.'
            : 'Enter your email. For security, the response is identical whether or not an account exists.'}
        </p>
        <ForgotPasswordForm locale={params.locale} />
      </section>
    </main>
  );
}
