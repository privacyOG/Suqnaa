import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { directionForLocale, isLocale, locales, type Locale } from '../../i18n/locales';
import { getMessages } from '../../i18n/get-messages';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) {
    return {};
  }

  const messages = getMessages(params.locale);
  return {
    title: messages.meta.title,
    description: messages.meta.description
  };
}

export default function LocaleLayout({ children, params }: { children: React.ReactNode; params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const locale = params.locale as Locale;

  return (
    <div lang={locale} dir={directionForLocale(locale)}>
      {children}
    </div>
  );
}
