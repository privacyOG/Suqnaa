import type { Metadata } from 'next';
import type { Locale } from '../i18n/locales';
import type { PublicListingDetail } from './public-listing-api';

const fallbackSiteUrl = 'http://localhost:3000';

function normaliseSiteUrl(value: string | undefined): URL {
  const raw = value?.trim() || fallbackSiteUrl;
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an absolute http(s) origin without credentials, query, or fragment');
  }
  parsed.pathname = '/';
  return parsed;
}

export const siteUrl = normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.WEB_ORIGIN);

export function absoluteUrl(pathname: string): string {
  return new URL(pathname.startsWith('/') ? pathname.slice(1) : pathname, siteUrl).toString();
}

export function localizedAlternates(pathname: string): NonNullable<Metadata['alternates']> {
  const suffix = pathname === '/' ? '' : pathname.startsWith('/') ? pathname : `/${pathname}`;
  return {
    canonical: absoluteUrl(`/en${suffix}`),
    languages: {
      en: absoluteUrl(`/en${suffix}`),
      ar: absoluteUrl(`/ar${suffix}`),
      'x-default': absoluteUrl(`/en${suffix}`)
    }
  };
}

export function localeCanonical(locale: Locale, pathname: string): NonNullable<Metadata['alternates']> {
  const suffix = pathname === '/' ? '' : pathname.startsWith('/') ? pathname : `/${pathname}`;
  return {
    canonical: absoluteUrl(`/${locale}${suffix}`),
    languages: {
      en: absoluteUrl(`/en${suffix}`),
      ar: absoluteUrl(`/ar${suffix}`),
      'x-default': absoluteUrl(`/en${suffix}`)
    }
  };
}

function conciseDescription(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1).trimEnd()}…`;
}

function conditionSchemaUrl(condition: PublicListingDetail['condition']): string {
  return condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition';
}

function availabilitySchemaUrl(status: PublicListingDetail['availabilityStatus']): string {
  if (status === 'out_of_stock') return 'https://schema.org/OutOfStock';
  if (status === 'limited') return 'https://schema.org/LimitedAvailability';
  return 'https://schema.org/InStock';
}

export function listingMetadata(listing: PublicListingDetail, locale: Locale): Metadata {
  const isArabic = locale === 'ar';
  const description = conciseDescription(listing.description);
  const canonical = absoluteUrl(`/${locale}/listings/${listing.id}`);
  const images = listing.media.length > 0
    ? listing.media.slice(0, 4).map((media) => ({ url: media.url, alt: media.altText ?? listing.title }))
    : undefined;

  return {
    title: `${listing.title} | Suqnaa`,
    description,
    alternates: localeCanonical(locale, `/listings/${listing.id}`),
    openGraph: {
      type: 'website',
      locale: isArabic ? 'ar_AU' : 'en_AU',
      alternateLocale: isArabic ? ['en_AU'] : ['ar_AU'],
      url: canonical,
      siteName: 'Suqnaa',
      title: listing.title,
      description,
      images
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: listing.title,
      description,
      images: images?.map((image) => image.url)
    }
  };
}

export function listingProductJsonLd(listing: PublicListingDetail, locale: Locale): Record<string, unknown> {
  const categoryName = listing.category
    ? (locale === 'ar' ? listing.category.nameAr ?? listing.category.nameEn : listing.category.nameEn)
    : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': absoluteUrl(`/${locale}/listings/${listing.id}#product`),
    url: absoluteUrl(`/${locale}/listings/${listing.id}`),
    name: listing.title,
    description: conciseDescription(listing.description, 500),
    image: listing.media.map((media) => media.url),
    category: categoryName,
    itemCondition: conditionSchemaUrl(listing.condition),
    offers: {
      '@type': 'Offer',
      priceCurrency: listing.currencyCode,
      price: String(listing.priceAmount),
      availability: availabilitySchemaUrl(listing.availabilityStatus),
      url: absoluteUrl(`/${locale}/listings/${listing.id}`),
      seller: {
        '@type': listing.seller.isBusiness ? 'Organization' : 'Person',
        name: listing.seller.businessName || listing.seller.displayName
      },
      areaServed: [listing.city, listing.region, listing.countryCode].filter(Boolean).join(', ') || listing.countryCode
    }
  };
}
