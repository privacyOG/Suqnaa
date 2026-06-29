import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, locales, type Locale } from '../../../../i18n/locales';
import { getPolicyPage, policySlugs } from '../../../../lib/policy-pages';

export function generateStaticParams() {
  return locales.flatMap((locale) => policySlugs.map((pageSlug) => ({ locale, pageSlug })));
}

export function generateMetadata({ params }: { params: { locale: string; pageSlug: string } }): Metadata {
  if (!isLocale(params.locale)) {
    return {};
  }

  const page = getPolicyPage(params.locale, params.pageSlug);
  if (!page) {
    return {};
  }

  return {
    title: `${page.title} | Suqnaa`,
    description: page.summary
  };
}

export default function PolicyPage({ params }: { params: { locale: string; pageSlug: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const locale = params.locale as Locale;
  const page = getPolicyPage(locale, params.pageSlug);

  if (!page) {
    notFound();
  }

  return (
    <main className="page-shell policy-page">
      <div className="policy-card">
        <Link className="language-link" href={`/${locale}`}>
          ← Suqnaa
        </Link>
        <p className="eyebrow">Beta readiness</p>
        <h1>{page.title}</h1>
        <p className="policy-summary">{page.summary}</p>
        <div className="policy-sections">
          {page.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
