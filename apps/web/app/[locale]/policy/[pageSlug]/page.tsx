import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, locales, type Locale } from '../../../../i18n/locales';
import { getPolicyPage, policySlugs } from '../../../../lib/policy-pages';

export function generateStaticParams() {
  return locales.flatMap((locale) => policySlugs.map((pageSlug) => ({ locale, pageSlug })));
}

export function generateMetadata({ params }: { params: { locale: string; pageSlug: string } }): Metadata {
  if (!isLocale(params.locale)) return {};
  const page = getPolicyPage(params.locale, params.pageSlug);
  if (!page) return {};
  return {
    title: `${page.title} | Suqnaa`,
    description: page.summary,
    alternates: { canonical: `/${params.locale}/policy/${page.canonicalSlug}` }
  };
}

export default function PolicyPage({ params }: { params: { locale: string; pageSlug: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const ar = locale === 'ar';
  const page = getPolicyPage(locale, params.pageSlug);
  if (!page) notFound();

  return (
    <main className="page-shell policy-page">
      <div className="policy-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Link className="language-link" href={`/${locale}/legal`}>
            {ar ? '← مركز السياسات' : '← Policy centre'}
          </Link>
          <Link className="language-link" href={`/${locale === 'ar' ? 'en' : 'ar'}/policy/${page.canonicalSlug}`}>
            {ar ? 'English' : 'العربية'}
          </Link>
        </div>

        <p className="eyebrow">{ar ? 'مرشح للمراجعة القانونية' : 'Legal-review candidate'}</p>
        <h1>{page.title}</h1>
        <p className="policy-summary">{page.summary}</p>
        <p><small>
          {ar ? 'الإصدار' : 'Version'}: {page.version} · {ar ? 'آخر تحديث' : 'Last updated'}: {page.lastUpdated} ·{' '}
          {ar ? 'تاريخ النفاذ' : 'Effective date'}: {page.effectiveDate ?? (ar ? 'غير نافذ بعد' : 'not yet effective')}
        </small></p>

        {page.reviewStatus !== 'approved' ? (
          <section className="seller-session-panel" role="note">
            <strong>{ar ? 'بانتظار الاعتماد القانوني' : 'Pending legal approval'}</strong>
            <p>{ar
              ? 'هذه الصياغة مرشحة للمراجعة وليست شروطاً قانونية نافذة. يجب اعتمادها أو استبدالها بعد مراجعة قانونية أسترالية قبل الإطلاق العام.'
              : 'This wording is a review candidate, not operative legal terms. It must be approved or replaced after Australian legal review before public launch.'}</p>
          </section>
        ) : null}

        <div className="policy-sections">
          {page.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.body.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
