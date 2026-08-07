import { notFound } from 'next/navigation';
import { OperationsVerificationPanel } from '../../../../components/operations-verification-panel';
import { isLocale } from '../../../../i18n/locales';

export default function OperationsVerificationsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const isArabic = params.locale === 'ar';

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}/operations`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/operations`}>{isArabic ? 'العمليات' : 'Operations'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>
      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{isArabic ? 'داخلي' : 'Internal'}</span>
          <h1>{isArabic ? 'مراجعة تحقق البائع' : 'Seller verification review'}</h1>
          <p>
            {isArabic
              ? 'راجع نتائج خدمة التحقق واتخذ القرار النهائي مع سجل تدقيق.'
              : 'Review verification-service results and make the final audited decision.'}
          </p>
        </div>
      </section>
      <OperationsVerificationPanel locale={params.locale} />
    </main>
  );
}
