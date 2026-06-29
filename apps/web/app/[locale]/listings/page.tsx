import { notFound } from 'next/navigation';
import { isLocale } from '../../../i18n/locales';
import {
  getPublicListings,
  PublicListingRequestError,
  type PublicListingAvailabilityStatus,
  type PublicListingSummary
} from '../../../lib/public-listing-api';

function formatPrice(listing: PublicListingSummary, locale: string): string {
  const amount = Number(listing.priceAmount);
  if (!Number.isFinite(amount)) {
    return `${listing.priceAmount} ${listing.currencyCode}`;
  }

  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
      style: 'currency',
      currency: listing.currencyCode,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${listing.currencyCode}`;
  }
}

function conditionLabel(condition: PublicListingSummary['condition'], isArabic: boolean): string {
  const labels: Record<PublicListingSummary['condition'], [string, string]> = {
    new: ['New', 'جديد'],
    like_new: ['Like new', 'كالجديد'],
    good: ['Good', 'جيد'],
    fair: ['Fair', 'مقبول'],
    parts_or_repair: ['Parts or repair', 'للقطع أو الإصلاح']
  };
  return labels[condition][isArabic ? 1 : 0];
}

function availabilityLabel(status: PublicListingAvailabilityStatus, isArabic: boolean): string {
  const labels: Record<PublicListingAvailabilityStatus, [string, string]> = {
    in_stock: ['In stock', 'متوفر'],
    limited: ['Limited', 'كمية محدودة'],
    out_of_stock: ['Out of stock', 'غير متوفر'],
    service_available: ['Service', 'خدمة']
  };
  return labels[status][isArabic ? 1 : 0];
}

export default async function PublicListingsPage({
  params,
  searchParams
}: {
  params: { locale: string };
  searchParams: { before?: string };
}) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  let listings: PublicListingSummary[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;

  try {
    const response = await getPublicListings({
      limit: 24,
      before: searchParams.before
    });
    listings = response.listings;
    nextCursor = response.pagination.nextCursor;
  } catch (caught) {
    error = caught instanceof PublicListingRequestError && caught.status === 429
      ? (isArabic ? 'طلبات كثيرة. حاول تصفح السوق بعد قليل.' : 'Too many requests. Try browsing again shortly.')
      : (isArabic ? 'تعذر تحميل السوق حالياً.' : 'The marketplace could not be loaded right now.');
  }

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/sell`}>{isArabic ? 'بيع' : 'Sell'}</a>
          <a href={`/${params.locale}/messages`}>{isArabic ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
          <a className="language-link" href={`/${isArabic ? 'en' : 'ar'}/listings`}>
            {isArabic ? 'English' : 'العربية'}
          </a>
        </div>
      </nav>

      <header className="catalog-header">
        <div>
          <div className="eyebrow">{isArabic ? 'السوق' : 'Marketplace'}</div>
          <h1>{isArabic ? 'اكتشف ما يبيعه مجتمعك' : 'Discover what your community is selling'}</h1>
          <p>
            {isArabic
              ? 'إعلانات نشطة من بائعين حقيقيين، مع خيارات تواصل وعروض محمية.'
              : 'Active listings from real sellers, with protected messaging and offer actions.'}
          </p>
        </div>
        <a className="button-primary" href={`/${params.locale}/sell`}>
          {isArabic ? 'أنشئ إعلاناً' : 'Create listing'}
        </a>
      </header>

      {error ? <p className="auth-error catalog-error" role="alert">{error}</p> : null}

      {!error && listings.length === 0 ? (
        <section className="empty-catalog">
          <strong>{isArabic ? 'لا توجد إعلانات نشطة بعد' : 'No active listings yet'}</strong>
          <p>
            {isArabic
              ? 'كن أول من ينشر إعلاناً في سوقنا.'
              : 'Be the first to publish something on Suqnaa.'}
          </p>
          <a className="button-primary" href={`/${params.locale}/sell`}>
            {isArabic ? 'ابدأ البيع' : 'Start selling'}
          </a>
        </section>
      ) : (
        <section className="catalog-grid" aria-label={isArabic ? 'الإعلانات' : 'Listings'}>
          {listings.map((listing) => {
            const location = [listing.suburb, listing.city, listing.region, listing.countryCode]
              .filter(Boolean)
              .join(', ');
            const sellerName = listing.seller?.displayName ?? (isArabic ? 'بائع سوقنا' : 'Suqnaa seller');
            const firstPhoto = listing.media[0];

            return (
              <article className="catalog-card" key={listing.id}>
                <a className="catalog-visual" href={`/${params.locale}/listings/${listing.id}`} aria-label={listing.title}>
                  {firstPhoto ? (
                    <img src={firstPhoto.url} alt={firstPhoto.altText ?? listing.title} loading="lazy" />
                  ) : (
                    <span>{listing.title.slice(0, 1).toUpperCase()}</span>
                  )}
                </a>
                <div className="catalog-card-body">
                  <div className="catalog-card-tags">
                    <span>{conditionLabel(listing.condition, isArabic)}</span>
                    <span>{availabilityLabel(listing.availabilityStatus, isArabic)}</span>
                    <span>{listing.allowDelivery ? (isArabic ? 'توصيل' : 'Delivery') : (isArabic ? 'استلام' : 'Pickup')}</span>
                  </div>
                  <h2>
                    <a href={`/${params.locale}/listings/${listing.id}`}>{listing.title}</a>
                  </h2>
                  <p className="catalog-price">{formatPrice(listing, params.locale)}</p>
                  <p className="catalog-location">{location || (isArabic ? 'الموقع غير محدد' : 'Location not specified')}</p>
                  <div className="catalog-seller-row">
                    <span>{sellerName}</span>
                    <a href={`/${params.locale}/listings/${listing.id}`}>
                      {isArabic ? 'عرض التفاصيل' : 'View details'}
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {nextCursor ? (
        <a
          className="button-secondary catalog-next"
          href={`/${params.locale}/listings?before=${encodeURIComponent(nextCursor)}`}
        >
          {isArabic ? 'المزيد من الإعلانات' : 'More listings'}
        </a>
      ) : null}
    </main>
  );
}
