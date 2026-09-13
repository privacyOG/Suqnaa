import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter } from '../../components/site-footer';
import { directionForLocale, isLocale, locales, type Locale } from '../../i18n/locales';
import { getMessages } from '../../i18n/get-messages';
import { absoluteUrl, localeCanonical } from '../../lib/seo';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) {
    return {};
  }

  const locale = params.locale as Locale;
  const messages = getMessages(locale);
  const canonical = absoluteUrl(`/${locale}`);

  return {
    title: messages.meta.title,
    description: messages.meta.description,
    alternates: localeCanonical(locale, '/'),
    openGraph: {
      type: 'website',
      locale: locale === 'ar' ? 'ar_AU' : 'en_AU',
      alternateLocale: locale === 'ar' ? ['en_AU'] : ['ar_AU'],
      url: canonical,
      siteName: 'Suqnaa',
      title: messages.meta.title,
      description: messages.meta.description
    },
    twitter: {
      card: 'summary',
      title: messages.meta.title,
      description: messages.meta.description
    }
  };
}

export default function LocaleLayout({ children, params }: { children: React.ReactNode; params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const locale = params.locale as Locale;
  const skipLabel = locale === 'ar' ? 'انتقل إلى المحتوى الرئيسي' : 'Skip to main content';

  return (
    <div lang={locale} dir={directionForLocale(locale)}>
      <a className="skip-link" href="#main-content">{skipLabel}</a>
      <div id="main-content" tabIndex={-1}>{children}</div>
      <SiteFooter locale={locale} />
    </div>
  );
}
