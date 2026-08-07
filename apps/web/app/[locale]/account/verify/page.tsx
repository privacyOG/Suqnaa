import { notFound } from 'next/navigation';
import { AccountVerificationPanel } from '../../../../components/account-verification-panel';
import { isLocale } from '../../../../i18n/locales';

export default function AccountVerifyPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';

  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}/account`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${isArabic ? 'en' : 'ar'}/account/verify`}>
          {isArabic ? 'English' : 'العربية'}
        </a>
      </nav>

      <section className="auth-card">
        <div className="eyebrow">{isArabic ? 'أمان الحساب' : 'Account security'}</div>
        <h1>{isArabic ? 'تحقق من وسيلة الاتصال' : 'Verify your contact details'}</h1>
        <p>
          {isArabic
            ? 'نرسل رمزاً لمرة واحدة إلى البريد الإلكتروني أو رقم الهاتف المسجل. تنتهي صلاحيته خلال 10 دقائق ولا يمكن استخدامه بعد نجاح التحقق.'
            : 'We send a single-use code to your registered email or phone. It expires after 10 minutes and cannot be reused after verification.'}
        </p>
        <AccountVerificationPanel locale={params.locale} />
      </section>
    </main>
  );
}
