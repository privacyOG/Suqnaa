import { OperationsDisputePanel } from '../../../../components/operations-dispute-panel';
import { isLocale } from '../../../../i18n/locales';

export default function OperationsDisputesPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const ar = params.locale === 'ar';
  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/operations`}>{ar ? 'العمليات' : 'Operations'}</a>
          <a href={`/${params.locale}/account`}>{ar ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>
      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{ar ? 'داخلي' : 'Internal'}</span>
          <h1>{ar ? 'مراجعة النزاعات' : 'Dispute review'}</h1>
          <p>{ar ? 'مراجعة الردود والأدلة والمهل والقرارات والاستئنافات.' : 'Review responses, evidence, deadlines, resolutions, and appeals.'}</p>
        </div>
      </section>
      <OperationsDisputePanel locale={params.locale} />
    </main>
  );
}
