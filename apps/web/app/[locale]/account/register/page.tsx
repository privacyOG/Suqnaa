import { AccountAuthForm } from '../../../../components/account-auth-form';

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
        <p>
          {isArabic
            ? 'أنشئ حسابك عبر جلسة آمنة مع حماية تلقائية من النشاط الآلي الضار.'
            : 'Create your account through a secure session with automated abuse protection.'}
        </p>
        <AccountAuthForm locale={params.locale} mode="register" />
      </section>
    </main>
  );
}
