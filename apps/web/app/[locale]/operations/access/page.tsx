import { OperationsAccessPanel } from '../../../../components/operations-access-panel';
import { isLocale } from '../../../../i18n/locales';

export default function OperationsAccessPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const isArabic = params.locale === 'ar';

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/operations`}>{isArabic ? 'العمليات' : 'Operations'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{isArabic ? 'إدارة محمية' : 'Protected administration'}</span>
          <h1>{isArabic ? 'الأدوار والصلاحيات' : 'Roles and permissions'}</h1>
          <p>
            {isArabic
              ? 'إدارة وصول الموظفين وفق مبدأ أقل صلاحية مع سجل تدقيق دائم.'
              : 'Manage staff access using least-privilege roles with durable audit history.'}
          </p>
        </div>
      </section>

      <OperationsAccessPanel locale={params.locale} />
    </main>
  );
}
