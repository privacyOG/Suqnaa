import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '../../../i18n/locales';
import { legalPolicies, legalPolicySlugs } from '../../../lib/legal-policy-content';

export default function LegalPolicyIndexPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const ar = locale === 'ar';

  return (
    <main className="page-shell catalog-page" dir={ar ? 'rtl' : 'ltr'}>
      <nav className="top-nav">
        <a className="brand-word" href={`/${locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${locale}/listings`}>{ar ? 'السوق' : 'Marketplace'}</a>
          <a href={`/${locale}/account`}>{ar ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{ar ? 'السياسات القانونية' : 'Legal & marketplace policies'}</span>
          <h1>{ar ? 'مركز السياسات' : 'Policy centre'}</h1>
          <p>{ar
            ? 'هذه النسخ مرشحة للمراجعة القانونية ولم تدخل حيز النفاذ بعد. سيظهر تاريخ النفاذ ورقم الإصدار المعتمد بعد موافقة المستشار القانوني.'
            : 'These versions are legal-review candidates and are not yet effective. An approved version and effective date will be published only after legal sign-off.'}</p>
        </div>
      </section>

      <section className="values" aria-label={ar ? 'قائمة السياسات' : 'Policy list'}>
        {legalPolicySlugs.map((slug) => {
          const policy = legalPolicies[slug];
          const content = policy[locale];
          return (
            <article className="value-card" key={slug}>
              <h2>{content.title}</h2>
              <p>{content.summary}</p>
              <p><small>{ar ? 'الإصدار المرشح' : 'Candidate version'}: {policy.version}</small></p>
              <a href={`/${locale}/legal/${slug}`}>{ar ? 'قراءة السياسة' : 'Read policy'}</a>
            </article>
          );
        })}
      </section>
    </main>
  );
}
