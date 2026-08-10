import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '../../../i18n/locales';

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) return {};
  const ar = params.locale === 'ar';
  return {
    title: ar ? 'حذف حساب سوقنا' : 'Delete your Suqnaa account',
    description: ar
      ? 'تعليمات طلب حذف حساب سوقنا والبيانات المرتبطة به.'
      : 'Instructions for requesting deletion of your Suqnaa account and associated data.',
    alternates: { canonical: `/${params.locale}/account-deletion` }
  };
}

export default function AccountDeletionPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const ar = locale === 'ar';

  return (
    <main className="page-shell policy-page" dir={ar ? 'rtl' : 'ltr'}>
      <div className="policy-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Link className="language-link" href={`/${locale}/legal`}>
            {ar ? 'مركز السياسات' : 'Policy centre'}
          </Link>
          <Link className="language-link" href={`/${ar ? 'en' : 'ar'}/account-deletion`}>
            {ar ? 'English' : 'العربية'}
          </Link>
        </div>

        <p className="eyebrow">{ar ? 'إدارة الحساب' : 'Account management'}</p>
        <h1>{ar ? 'حذف حساب سوقنا' : 'Delete your Suqnaa account'}</h1>
        <p className="policy-summary">
          {ar
            ? 'يمكنك بدء حذف الحساب من داخل تطبيق سوقنا. يتطلب الطلب جلسة مسجلة الدخول وكلمة المرور الحالية وتأكيداً صريحاً.'
            : 'You can start account deletion inside the Suqnaa app. The request requires a signed-in session, your current password and explicit confirmation.'}
        </p>

        <section>
          <h2>{ar ? 'من داخل التطبيق' : 'In the app'}</h2>
          <ol>
            <li>{ar ? 'سجّل الدخول وافتح «الملف والخصوصية».' : 'Sign in and open “Profile and privacy”.'}</li>
            <li>{ar ? 'انتقل إلى أدوات إغلاق الحساب واختر وضع الحذف.' : 'Go to the account closure controls and choose deletion mode.'}</li>
            <li>{ar ? 'أدخل كلمة المرور الحالية واتبع خطوة التأكيد الظاهرة في التطبيق.' : 'Enter your current password and complete the confirmation shown by the app.'}</li>
            <li>{ar ? 'بعد قبول الطلب يتم إنهاء الجلسات ويبدأ مسار الحذف/إخفاء الهوية وفق سياسة الاحتفاظ المطبقة.' : 'After acceptance, sessions are revoked and the deletion/anonymisation workflow proceeds subject to the applicable retention policy.'}</li>
          </ol>
        </section>

        <section>
          <h2>{ar ? 'إذا لم تتمكن من الوصول إلى التطبيق' : 'If you cannot access the app'}</h2>
          <p>
            {ar
              ? 'استخدم صفحة الاتصال لإرسال طلب دعم متعلق بحذف الحساب. سيُطلب التحقق من ملكية الحساب قبل تنفيذ أي إجراء.'
              : 'Use the contact page to request account-deletion support. Account ownership must be verified before any account action is taken.'}
          </p>
          <p>
            <Link href={`/${locale}/policy/contact`}>{ar ? 'فتح صفحة الاتصال' : 'Open contact page'}</Link>
          </p>
        </section>

        <section>
          <h2>{ar ? 'البيانات التي قد يلزم الاحتفاظ بها' : 'Data that may need to be retained'}</h2>
          <p>
            {ar
              ? 'قد يلزم الاحتفاظ بسجلات محدودة عندما يفرض القانون ذلك أو عندما تكون ضرورية لمعاملات أو نزاعات أو منع الاحتيال أو المحاسبة أو الامتثال. راجع سياسة الاحتفاظ بالبيانات وسياسة الخصوصية للحصول على التفاصيل الحالية.'
              : 'Limited records may need to be retained where required by law or necessary for transactions, disputes, fraud prevention, accounting or compliance. See the Data Retention Policy and Privacy Policy for the current detail.'}
          </p>
          <p>
            <Link href={`/${locale}/policy/data-retention`}>{ar ? 'سياسة الاحتفاظ بالبيانات' : 'Data Retention Policy'}</Link>{' · '}
            <Link href={`/${locale}/policy/privacy`}>{ar ? 'سياسة الخصوصية' : 'Privacy Policy'}</Link>
          </p>
        </section>

        <section className="seller-session-panel" role="note">
          <strong>{ar ? 'حالة السياسة' : 'Policy status'}</strong>
          <p>
            {ar
              ? 'النصوص القانونية المرتبطة بالخصوصية والاحتفاظ بالبيانات ما زالت بانتظار الاعتماد القانوني النهائي قبل الإطلاق العام.'
              : 'The related privacy and retention wording remains subject to final legal approval before public launch.'}
          </p>
        </section>
      </div>
    </main>
  );
}
