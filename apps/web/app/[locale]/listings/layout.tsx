import type { Metadata } from 'next';
import { isLocale, type Locale } from '../../../i18n/locales';
import { localeCanonical } from '../../../lib/seo';

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) return { robots: { index: false, follow: false } };
  const locale = params.locale as Locale;
  const isArabic = locale === 'ar';
  const title = isArabic ? 'السوق | سوقنا' : 'Marketplace | Suqnaa';
  const description = isArabic
    ? 'استكشف الإعلانات النشطة على سوقنا مع البحث والتصفية حسب الفئة والحالة والسعر والموقع وطرق الاستلام والتوصيل.'
    : 'Explore active Suqnaa listings with marketplace search and filters for category, condition, price, location, pickup, and delivery.';

  return {
    title,
    description,
    alternates: localeCanonical(locale, '/listings'),
    openGraph: {
      type: 'website',
      locale: isArabic ? 'ar_AU' : 'en_AU',
      alternateLocale: isArabic ? ['en_AU'] : ['ar_AU'],
      title,
      description
    },
    twitter: {
      card: 'summary',
      title,
      description
    }
  };
}

export default function ListingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
