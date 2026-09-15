import { ResetPasswordForm } from '../../../../components/reset-password-form';

export default async function ResetPasswordPage(
  props: {
    params: Promise<{ locale: string }>;
    searchParams?: Promise<{ token?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const isArabic = params.locale === 'ar';
  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${params.locale}/account/sign-in`}>{isArabic ? 'تسجيل الدخول' : 'Sign in'}</a>
      </nav>
      <section className="auth-card">
        <div className="eyebrow">{isArabic ? 'أمان الحساب' : 'Account security'}</div>
        <h1>{isArabic ? 'تعيين كلمة مرور جديدة' : 'Set a new password'}</h1>
        <p>
          {isArabic
            ? 'رموز إعادة التعيين صالحة لمدة 20 دقيقة وتُستخدم مرة واحدة فقط. سيؤدي نجاح العملية إلى إلغاء جميع الجلسات الحالية.'
            : 'Reset tokens expire after 20 minutes and can be used once. A successful reset revokes every existing session.'}
        </p>
        <ResetPasswordForm locale={params.locale} initialToken={searchParams?.token ?? ''} />
      </section>
    </main>
  );
}
