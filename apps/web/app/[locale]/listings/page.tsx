import { notFound } from 'next/navigation';
import { isLocale } from '../../../i18n/locales';
import {
  getPublicListings,
  PublicListingRequestError,
  type PublicListingAvailabilityStatus,
  type PublicListingCondition,
  type PublicListingFulfilment,
  type PublicListingsOptions,
  type PublicListingSummary
} from '../../../lib/public-listing-api';

const listingConditions: PublicListingCondition[] = [
  'new',
  'like_new',
  'good',
  'fair',
  'parts_or_repair'
];

const availabilityStatuses: PublicListingAvailabilityStatus[] = [
  'in_stock',
  'limited',
  'out_of_stock',
  'service_available'
];

const fulfilmentOptions: PublicListingFulfilment[] = ['pickup', 'delivery'];
const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

interface CatalogSearchParams {
  before?: string | string[];
  q?: string | string[];
  categoryId?: string | string[];
  condition?: string | string[];
  availabilityStatus?: string | string[];
  minPrice?: string | string[];
  maxPrice?: string | string[];
  currency?: string | string[];
  country?: string | string[];
  city?: string | string[];
  fulfilment?: string | string[];
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function trimmedParam(
  value: string | string[] | undefined,
  maximumLength: number
): string | undefined {
  const trimmed = firstParam(value)?.trim();
  return trimmed && trimmed.length <= maximumLength ? trimmed : undefined;
}

function numericParam(value: string | string[] | undefined): number | undefined {
  const raw = firstParam(value)?.trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function catalogOptions(searchParams: CatalogSearchParams): PublicListingsOptions {
  const conditionValue = firstParam(searchParams.condition);
  const availabilityValue = firstParam(searchParams.availabilityStatus);
  const fulfilmentValue = firstParam(searchParams.fulfilment);
  const categoryId = trimmedParam(searchParams.categoryId, 36);
  const currency = trimmedParam(searchParams.currency, 3)?.toUpperCase();
  const country = trimmedParam(searchParams.country, 2)?.toUpperCase();

  return {
    limit: 24,
    before: trimmedParam(searchParams.before, 40),
    q: trimmedParam(searchParams.q, 200),
    categoryId: categoryId && uuidPattern.test(categoryId) ? categoryId : undefined,
    condition: listingConditions.includes(conditionValue as PublicListingCondition)
      ? conditionValue as PublicListingCondition
      : undefined,
    availabilityStatus: availabilityStatuses.includes(
      availabilityValue as PublicListingAvailabilityStatus
    )
      ? availabilityValue as PublicListingAvailabilityStatus
      : undefined,
    minPrice: numericParam(searchParams.minPrice),
    maxPrice: numericParam(searchParams.maxPrice),
    currency: currency?.length === 3 ? currency : undefined,
    country: country?.length === 2 ? country : undefined,
    city: trimmedParam(searchParams.city, 120),
    fulfilment: fulfilmentOptions.includes(fulfilmentValue as PublicListingFulfilment)
      ? fulfilmentValue as PublicListingFulfilment
      : undefined
  };
}

function catalogHref(
  locale: string,
  options: PublicListingsOptions,
  before?: string
): string {
  const query = new URLSearchParams();

  if (before) query.set('before', before);
  if (options.q) query.set('q', options.q);
  if (options.categoryId) query.set('categoryId', options.categoryId);
  if (options.condition) query.set('condition', options.condition);
  if (options.availabilityStatus) query.set('availabilityStatus', options.availabilityStatus);
  if (options.minPrice !== undefined) query.set('minPrice', String(options.minPrice));
  if (options.maxPrice !== undefined) query.set('maxPrice', String(options.maxPrice));
  if (options.currency) query.set('currency', options.currency);
  if (options.country) query.set('country', options.country);
  if (options.city) query.set('city', options.city);
  if (options.fulfilment) query.set('fulfilment', options.fulfilment);

  const encoded = query.toString();
  return `/${locale}/listings${encoded ? `?${encoded}` : ''}`;
}

function hasActiveFilters(options: PublicListingsOptions): boolean {
  return Boolean(
    options.q ||
    options.categoryId ||
    options.condition ||
    options.availabilityStatus ||
    options.minPrice !== undefined ||
    options.maxPrice !== undefined ||
    options.currency ||
    options.country ||
    options.city ||
    options.fulfilment
  );
}

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
  searchParams: CatalogSearchParams;
}) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const options = catalogOptions(searchParams);
  const filtersActive = hasActiveFilters(options);
  let listings: PublicListingSummary[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;

  try {
    const response = await getPublicListings(options);
    listings = response.listings;
    nextCursor = response.pagination.nextCursor;
  } catch (caught) {
    error = caught instanceof PublicListingRequestError && caught.status === 429
      ? (isArabic ? 'طلبات كثيرة. حاول تصفح السوق بعد قليل.' : 'Too many requests. Try browsing again shortly.')
      : caught instanceof PublicListingRequestError && caught.status === 400
        ? (isArabic ? 'تحقق من خيارات البحث ثم أعد المحاولة.' : 'Check the search filters and try again.')
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
          <a
            className="language-link"
            href={catalogHref(isArabic ? 'en' : 'ar', options)}
          >
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

      <form className="catalog-filter-form" method="get" action={`/${params.locale}/listings`}>
        {options.categoryId ? <input type="hidden" name="categoryId" value={options.categoryId} /> : null}
        <label className="catalog-filter-search">
          <span>{isArabic ? 'البحث' : 'Search'}</span>
          <input
            type="search"
            name="q"
            maxLength={200}
            defaultValue={options.q ?? ''}
            placeholder={isArabic ? 'ابحث بالعنوان أو الوصف' : 'Search title or description'}
          />
        </label>

        <label>
          <span>{isArabic ? 'الحالة' : 'Condition'}</span>
          <select name="condition" defaultValue={options.condition ?? ''}>
            <option value="">{isArabic ? 'كل الحالات' : 'Any condition'}</option>
            {listingConditions.map((condition) => (
              <option key={condition} value={condition}>
                {conditionLabel(condition, isArabic)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{isArabic ? 'التوفر' : 'Availability'}</span>
          <select name="availabilityStatus" defaultValue={options.availabilityStatus ?? ''}>
            <option value="">{isArabic ? 'كل خيارات التوفر' : 'Any availability'}</option>
            {availabilityStatuses.map((status) => (
              <option key={status} value={status}>
                {availabilityLabel(status, isArabic)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{isArabic ? 'الحد الأدنى للسعر' : 'Minimum price'}</span>
          <input type="number" name="minPrice" min="0" step="0.01" defaultValue={options.minPrice} />
        </label>

        <label>
          <span>{isArabic ? 'الحد الأعلى للسعر' : 'Maximum price'}</span>
          <input type="number" name="maxPrice" min="0" step="0.01" defaultValue={options.maxPrice} />
        </label>

        <label>
          <span>{isArabic ? 'العملة' : 'Currency'}</span>
          <input name="currency" minLength={3} maxLength={3} defaultValue={options.currency ?? 'AUD'} />
        </label>

        <label>
          <span>{isArabic ? 'الدولة' : 'Country'}</span>
          <input name="country" minLength={2} maxLength={2} defaultValue={options.country ?? 'AU'} />
        </label>

        <label>
          <span>{isArabic ? 'المدينة' : 'City'}</span>
          <input name="city" maxLength={120} defaultValue={options.city ?? ''} placeholder={isArabic ? 'سيدني' : 'Sydney'} />
        </label>

        <label>
          <span>{isArabic ? 'طريقة الاستلام' : 'Fulfilment'}</span>
          <select name="fulfilment" defaultValue={options.fulfilment ?? ''}>
            <option value="">{isArabic ? 'الكل' : 'Any'}</option>
            <option value="pickup">{isArabic ? 'استلام' : 'Pickup'}</option>
            <option value="delivery">{isArabic ? 'توصيل' : 'Delivery'}</option>
          </select>
        </label>

        <div className="catalog-filter-actions">
          <button className="button-primary" type="submit">
            {isArabic ? 'تطبيق البحث' : 'Apply filters'}
          </button>
          {filtersActive ? (
            <a className="button-secondary" href={`/${params.locale}/listings`}>
              {isArabic ? 'مسح الخيارات' : 'Clear filters'}
            </a>
          ) : null}
        </div>
      </form>

      {!error ? (
        <p className="catalog-result-count" aria-live="polite">
          {isArabic
            ? `${listings.length} نتيجة${filtersActive ? ' مطابقة' : ''}`
            : `${listings.length} result${listings.length === 1 ? '' : 's'}${filtersActive ? ' matching your filters' : ''}`}
        </p>
      ) : null}

      {error ? <p className="auth-error catalog-error" role="alert">{error}</p> : null}

      {!error && listings.length === 0 ? (
        <section className="empty-catalog">
          <strong>
            {filtersActive
              ? (isArabic ? 'لا توجد نتائج مطابقة' : 'No listings match these filters')
              : (isArabic ? 'لا توجد إعلانات نشطة بعد' : 'No active listings yet')}
          </strong>
          <p>
            {filtersActive
              ? (isArabic ? 'غيّر خيارات البحث أو امسحها لعرض إعلانات أخرى.' : 'Adjust or clear the filters to see other listings.')
              : (isArabic ? 'كن أول من ينشر إعلاناً في سوقنا.' : 'Be the first to publish something on Suqnaa.')}
          </p>
          {filtersActive ? (
            <a className="button-secondary" href={`/${params.locale}/listings`}>
              {isArabic ? 'عرض كل الإعلانات' : 'View all listings'}
            </a>
          ) : (
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
          href={catalogHref(params.locale, options, nextCursor)}
        >
          {isArabic ? 'المزيد من الإعلانات' : 'More listings'}
        </a>
      ) : null}
    </main>
  );
}
