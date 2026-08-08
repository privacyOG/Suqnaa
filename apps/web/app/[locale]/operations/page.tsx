import { OperationRecordsPanel } from '../../../components/operation-records-panel';
import { OperationsQueueBrowserPanel } from '../../../components/operations-queue-browser-panel';
import { OperationsQueuePanel } from '../../../components/operations-queue-panel';
import { isLocale } from '../../../i18n/locales';
import { loadOperationsDashboardSummary } from '../../../lib/operations-dashboard-server';

type MetricCard = {
  key: string;
  titleEn: string;
  titleAr: string;
  value: string;
  detailEn: string;
  detailAr: string;
  href?: string;
  available: boolean;
};

export default async function OperationsPage({
  params
}: {
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) return null;

  const isArabic = params.locale === 'ar';
  const summary = await loadOperationsDashboardSummary();
  const sections = summary?.sections;
  const number = (value: number | null | undefined) => value === null || value === undefined ? '—' : String(value);

  const cards: MetricCard[] = sections ? [
    {
      key: 'reports', titleEn: 'Reports', titleAr: 'البلاغات',
      value: number(sections.reports.open), detailEn: 'Open moderation reports', detailAr: 'بلاغات الإشراف المفتوحة',
      href: `/${params.locale}/operations#reports`, available: sections.reports.available
    },
    {
      key: 'accounts', titleEn: 'Accounts', titleAr: 'الحسابات',
      value: number(sections.accounts.suspended), detailEn: 'Suspended accounts', detailAr: 'الحسابات الموقوفة',
      href: `/${params.locale}/operations#reports`, available: sections.accounts.available
    },
    {
      key: 'listings', titleEn: 'Listings', titleAr: 'الإعلانات',
      value: number(sections.listings.removed), detailEn: 'Removed listings', detailAr: 'الإعلانات المحذوفة',
      href: `/${params.locale}/operations#reports`, available: sections.listings.available
    },
    {
      key: 'categories', titleEn: 'Categories', titleAr: 'الفئات',
      value: number(sections.categories.total), detailEn: 'Configured categories', detailAr: 'الفئات المهيأة',
      available: sections.categories.available
    },
    {
      key: 'identity', titleEn: 'Identity checks', titleAr: 'التحقق من الهوية',
      value: number(sections.identityChecks.pending), detailEn: 'Pending reviews', detailAr: 'مراجعات معلقة',
      href: `/${params.locale}/operations/verifications`, available: sections.identityChecks.available
    },
    {
      key: 'disputes', titleEn: 'Disputes', titleAr: 'النزاعات',
      value: number(sections.disputes.active), detailEn: 'Active disputes', detailAr: 'النزاعات النشطة',
      href: `/${params.locale}/operations/disputes`, available: sections.disputes.available
    },
    {
      key: 'payments', titleEn: 'Payments', titleAr: 'المدفوعات',
      value: number(sections.payments.awaitingDecision), detailEn: `${number(sections.payments.failed)} failed · awaiting decisions`, detailAr: `${number(sections.payments.failed)} فاشلة · بانتظار القرار`,
      available: sections.payments.available
    },
    {
      key: 'settlements', titleEn: 'Seller settlements', titleAr: 'تسويات البائعين',
      value: number(sections.settlements.blocked), detailEn: 'Blocked settlements', detailAr: 'تسويات محظورة',
      available: sections.settlements.available
    },
    {
      key: 'fulfilment', titleEn: 'Fulfilment & returns', titleAr: 'التسليم والإرجاع',
      value: number(sections.fulfilment.activeReturns), detailEn: `${number(sections.fulfilment.failed)} failed fulfilments`, detailAr: `${number(sections.fulfilment.failed)} عمليات تسليم فاشلة`,
      available: sections.fulfilment.available
    },
    {
      key: 'fraud', titleEn: 'Fraud signals', titleAr: 'إشارات الاحتيال',
      value: sections.fraudSignals.available
        ? String((sections.fraudSignals.openFraudReports ?? 0) + (sections.fraudSignals.openChargebacks ?? 0))
        : '—',
      detailEn: 'Existing fraud reports + open chargebacks', detailAr: 'بلاغات الاحتيال الحالية + عمليات رد المبالغ',
      available: sections.fraudSignals.available
    },
    {
      key: 'audit', titleEn: 'Audit review', titleAr: 'مراجعة التدقيق',
      value: number(sections.audit.last24Hours), detailEn: 'Administrative events in 24h', detailAr: 'أحداث إدارية خلال 24 ساعة',
      href: `/${params.locale}/operations#audit`, available: sections.audit.available
    }
  ] : [];

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
          <span className="buyer-action-label">{isArabic ? 'إدارة محمية' : 'Protected administration'}</span>
          <h1>{isArabic ? 'لوحة إدارة سوقنا' : 'Suqnaa administration dashboard'}</h1>
          <p>
            {isArabic
              ? 'نظرة موحدة ومقيدة بالصلاحيات على أعمال الإشراف والثقة والدفع والتسليم والتدقيق.'
              : 'A permission-aware view of moderation, trust, payment, fulfilment, risk, and audit workload.'}
          </p>
          <div className="actions">
            <a className="button-secondary" href={`/${params.locale}/operations/disputes`}>{isArabic ? 'النزاعات' : 'Disputes'}</a>
            <a className="button-secondary" href={`/${params.locale}/operations/verifications`}>{isArabic ? 'التحقق' : 'Identity checks'}</a>
            <a className="button-secondary" href={`/${params.locale}/operations/access`}>{isArabic ? 'الأدوار والصلاحيات' : 'Roles and permissions'}</a>
          </div>
        </div>
      </section>

      {!summary ? (
        <section className="seller-session-panel">
          <h2>{isArabic ? 'تعذر تحميل ملخص الإدارة' : 'Administration summary unavailable'}</h2>
          <p>{isArabic ? 'سجّل الدخول بحساب عمليات مخول أو أعد المحاولة.' : 'Sign in with an authorised operations account or retry.'}</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="admin-workload-heading">
            <h2 id="admin-workload-heading">{isArabic ? 'عبء العمل' : 'Operational workload'}</h2>
            <div className="catalog-grid">
              {cards.map((card) => (
                <article className="seller-session-panel" key={card.key}>
                  <div className="eyebrow">{card.available ? (isArabic ? 'متاح' : 'Available') : (isArabic ? 'مقيد' : 'Restricted')}</div>
                  <h3>{isArabic ? card.titleAr : card.titleEn}</h3>
                  <p style={{ fontSize: '2rem', fontWeight: 900, margin: '0.25rem 0' }}>{card.available ? card.value : '—'}</p>
                  <p>{isArabic ? card.detailAr : card.detailEn}</p>
                  {card.href && card.available ? <a className="button-secondary" href={card.href}>{isArabic ? 'فتح' : 'Open'}</a> : null}
                  {!card.href && card.available ? <small>{isArabic ? 'لوحة متخصصة قيد الإكمال ضمن P0-28.' : 'Specialist panel is being completed in P0-28.'}</small> : null}
                </article>
              ))}
            </div>
          </section>
          <p><small>{isArabic ? 'تم إنشاء الملخص:' : 'Summary generated:'} {new Date(summary.generatedAt).toLocaleString(isArabic ? 'ar-AU' : 'en-AU')}</small></p>
        </>
      )}

      <section id="reports">
        <OperationsQueuePanel locale={params.locale} />
        <OperationsQueueBrowserPanel locale={params.locale} />
      </section>
      <section id="audit">
        <OperationRecordsPanel locale={params.locale} />
      </section>
    </main>
  );
}
