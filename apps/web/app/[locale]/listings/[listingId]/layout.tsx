import type { Metadata } from 'next';
import { isLocale, type Locale } from '../../../../i18n/locales';
import { getPublicListing, PublicListingRequestError } from '../../../../lib/public-listing-api';
import { listingMetadata, listingProductJsonLd } from '../../../../lib/seo';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadListing(locale: string, listingId: string) {
  if (!isLocale(locale) || !uuidPattern.test(listingId)) return null;
  try {
    return await getPublicListing(listingId);
  } catch (caught) {
    if (caught instanceof PublicListingRequestError && caught.status === 404) return null;
    return null;
  }
}

export async function generateMetadata({
  params
}: {
  params: { locale: string; listingId: string };
}): Promise<Metadata> {
  const listing = await loadListing(params.locale, params.listingId);
  if (!listing || !isLocale(params.locale)) {
    return {
      robots: { index: false, follow: false }
    };
  }
  return listingMetadata(listing, params.locale as Locale);
}

export default async function ListingSeoLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { locale: string; listingId: string };
}) {
  const listing = await loadListing(params.locale, params.listingId);
  const structuredData = listing && isLocale(params.locale)
    ? listingProductJsonLd(listing, params.locale as Locale)
    : null;

  return (
    <>
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c')
          }}
        />
      ) : null}
      {children}
    </>
  );
}
