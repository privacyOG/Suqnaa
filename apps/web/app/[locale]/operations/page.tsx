import { OperationsQueuePanel } from '../../../components/operations-queue-panel';
import { isLocale } from '../../../i18n/locales';

export default function OperationsPage({
  params
}: {
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) {
    return null;
  }

  const isArabic = params.locale === 'ar';

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/listings`}>{isArabic ? 'السوق' : 'Marketplace'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{isArabic ? 'داخلي' : 'Internal'}</span>
          <h1>{isArabic ? 'قائمة العمليات' : 'Operations queue'}</h1>
          <p>
            {isArabic
              ? 'عرض داخلي للعناصر الواردة من السوق.'
              : 'Internal view for submitted marketplace items.'}
          </p>
        </div>
      </section>

      <OperationsQueuePanel locale={params.locale} />
    </main>
  );
}
