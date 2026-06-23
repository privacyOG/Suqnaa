import { notFound } from 'next/navigation';
import { isLocale } from '../../../i18n/locales';
import {
  getPublicListings,
  PublicListingRequestError,
  type PublicListingCondition,
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

const CONDITIONS: { value: PublicListingCondition; en: string; ar: string }[] = [
  { value: 'new', en: 'New', ar: 'جديد' },
  { value: 'like_new', en: 'Like new', ar: 'كالجديد' },
  { value: 'good', en: 'Good', ar: 'جيد' },
  { value: 'fair', en: 'Fair', ar: 'مقبول' },
  { value: 'parts_or_repair', en: 'Parts / repair', ar: 'قطع أو إصلاح' }
];

export default async function PublicListingsPage({
  params,
  searchParams
}: {
  params: { locale: string };
  searchParams: {
    before?: string;
    q?: string;
    condition?: string;
    minPrice?: string;
    maxPrice?: string;
    country?: string;
    city?: string;
  };
}) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  let listings: PublicListingSummary[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;

  const conditionParam = CONDITIONS.find((c) => c.value === searchParams.condition)?.value;
  const minPrice = searchParams.minPrice ? Number(searchParams.minPrice) : undefined;
  const maxPrice = searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined;

  try {
    const response = await getPublicListings({
      limit: 24,
      before: searchParams.before,
      q: searchParams.q,
      condition: conditionParam,
      minPrice: minPrice !== undefined && Number.isFinite(minPrice) ? minPrice : undefined,
      maxPrice: maxPrice !== undefined && Number.isFinite(maxPrice) ? maxPrice : undefined,
      country: searchParams.country,
      city: searchParams.city
    });
    listings = response.listings;
    nextCursor = response.pagination.nextCursor;
  } catch (caught) {
    error = caught instanceof PublicListingRequestError && caught.status === 429
      ? (isArabic ? 'طلبات كثيرة. حاول تصفح السوق بعد قليل.' : 'Too many requests. Try browsing again shortly.')
      : (isArabic ? 'تعذر تحميل السوق حالياً.' : 'The marketplace could not be loaded right now.');
  }

  const currentParams = new URLSearchParams();
  if (searchParams.q) currentParams.set('q', searchParams.q);
  if (searchParams.condition) currentParams.set('condition', searchParams.condition);
  if (searchParams.minPrice) currentParams.set('minPrice', searchParams.minPrice);
  if (searchParams.maxPrice) currentParams.set('maxPrice', searchParams.maxPrice);
  if (searchParams.country) currentParams.set('country', searchParams.country);
  if (searchParams.city) currentParams.set('city', searchParams.city);
  const hasFilters = currentParams.toString().length > 0;

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
        </div>
        <a className="button-primary" href={`/${params.locale}/sell`}>
          {isArabic ? 'أنشئ إعلاناً' : 'Create listing'}
        </a>
      </header>

      {/* Search & filter bar */}
      <form className="catalog-search-bar" method="GET" action={`/${params.locale}/listings`}>
        <input
          type="search"
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder={isArabic ? 'ابحث في الإعلانات…' : 'Search listings…'}
          className="catalog-search-input"
          maxLength={200}
        />
        <select name="condition" defaultValue={searchParams.condition ?? ''} className="catalog-filter-select">
          <option value="">{isArabic ? 'الحالة' : 'Condition'}</option>
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {isArabic ? c.ar : c.en}
            </option>
          ))}
        </select>
        <input
          type="number"
          name="minPrice"
          defaultValue={searchParams.minPrice ?? ''}
          placeholder={isArabic ? 'أدنى سعر' : 'Min price'}
          min="0"
          className="catalog-filter-price"
        />
        <input
          type="number"
          name="maxPrice"
          defaultValue={searchParams.maxPrice ?? ''}
          placeholder={isArabic ? 'أعلى سعر' : 'Max price'}
          min="0"
          className="catalog-filter-price"
        />
        <input
          type="text"
          name="city"
          defaultValue={searchParams.city ?? ''}
          placeholder={isArabic ? 'المدينة' : 'City'}
          maxLength={120}
          className="catalog-filter-city"
        />
        <button type="submit" className="button-primary catalog-search-btn">
          {isArabic ? 'بحث' : 'Search'}
        </button>
        {hasFilters && (
          <a className="button-secondary catalog-clear-btn" href={`/${params.locale}/listings`}>
            {isArabic ? 'مسح' : 'Clear'}
          </a>
        )}
      </form>

      {error ? <p className="auth-error catalog-error" role="alert">{error}</p> : null}

      {!error && listings.length === 0 ? (
        <section className="empty-catalog">
          <strong>
            {hasFilters
              ? (isArabic ? 'لا توجد نتائج تطابق البحث' : 'No listings match your search')
              : (isArabic ? 'لا توجد إعلانات نشطة بعد' : 'No active listings yet')}
          </strong>
          <p>
            {hasFilters
              ? (isArabic ? 'جرّب تعديل معايير البحث.' : 'Try adjusting your search criteria.')
              : (isArabic ? 'كن أول من ينشر إعلاناً في سوقنا.' : 'Be the first to publish something on Suqnaa.')}
          </p>
          {!hasFilters && (
            <a className="button-primary" href={`/${params.locale}/sell`}>
              {isArabic ? 'ابدأ البيع' : 'Start selling'}
            </a>
          )}
        </section>
      ) : (
        <section className="catalog-grid" aria-label={isArabic ? 'الإعلانات' : 'Listings'}>
          {listings.map((listing) => {
            const location = [listing.suburb, listing.city, listing.region, listing.countryCode]
              .filter(Boolean)
              .join(', ');
            const sellerName = listing.seller?.displayName ?? (isArabic ? 'بائع سوقنا' : 'Suqnaa seller');

            return (
              <article className="catalog-card" key={listing.id}>
                <a className="catalog-visual" href={`/${params.locale}/listings/${listing.id}`} aria-label={listing.title}>
                  {listing.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={listing.coverImageUrl}
                      alt={listing.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span>{listing.title.slice(0, 1).toUpperCase()}</span>
                  )}
                </a>
                <div className="catalog-card-body">
                  <div className="catalog-card-tags">
                    <span>{conditionLabel(listing.condition, isArabic)}</span>
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
          href={`/${params.locale}/listings?${new URLSearchParams({
            ...Object.fromEntries(currentParams.entries()),
            before: nextCursor
          }).toString()}`}
        >
          {isArabic ? 'المزيد من الإعلانات' : 'More listings'}
        </a>
      ) : null}
    </main>
  );
}
