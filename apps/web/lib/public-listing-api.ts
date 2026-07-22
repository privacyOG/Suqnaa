export type PublicListingCondition =
  | 'new'
  | 'like_new'
  | 'good'
  | 'fair'
  | 'parts_or_repair';

export type PublicListingAvailabilityStatus =
  | 'in_stock'
  | 'limited'
  | 'out_of_stock'
  | 'service_available';

export type PublicListingFulfilment = 'pickup' | 'delivery' | 'both';
export type PublicListingSort = 'newest' | 'price_asc' | 'price_desc';

export interface PublicListingMedia {
  id: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  sortOrder: number;
  altText: string | null;
  createdAt: string;
}

export interface PublicSellerSummary {
  id: string;
  displayName: string;
  status: string;
}

export interface PublicCategorySummary {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
}

export interface PublicListingSummary {
  id: string;
  title: string;
  description: string;
  priceAmount: string | number;
  currencyCode: string;
  condition: PublicListingCondition;
  availabilityStatus: PublicListingAvailabilityStatus;
  availableQuantity: number | null;
  unitLabel: string | null;
  countryCode: string;
  region: string | null;
  city: string | null;
  suburb: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
  publishedAt: string | null;
  createdAt: string;
  media: PublicListingMedia[];
  mediaCount: number;
  category: PublicCategorySummary | null;
  seller: PublicSellerSummary | null;
}

export interface PublicListingDetail extends Omit<PublicListingSummary, 'seller'> {
  status: 'active';
  expiresAt: string | null;
  updatedAt: string;
  seller: PublicSellerSummary & {
    emailVerified: boolean;
    phoneVerified: boolean;
    trustScore: number;
    isBusiness: boolean;
    businessName: string | null;
    city: string | null;
    countryCode: string | null;
    verification: {
      status: string;
      level: string | null;
      reviewedAt: string | null;
      expiresAt: string | null;
    };
  };
}

export interface PublicListingsResponse {
  listings: PublicListingSummary[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface PublicListingsOptions {
  limit?: number;
  before?: string;
  q?: string;
  categoryId?: string;
  condition?: PublicListingCondition;
  availabilityStatus?: PublicListingAvailabilityStatus;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  country?: string;
  region?: string;
  city?: string;
  suburb?: string;
  fulfilment?: PublicListingFulfilment;
  sort?: PublicListingSort;
}

export class PublicListingRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PublicListingRequestError';
  }
}

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

function withAbsoluteMediaUrls<T extends { media?: PublicListingMedia[] }>(listing: T): T {
  return {
    ...listing,
    media: (listing.media ?? []).map((media) => ({
      ...media,
      url: media.url.startsWith('http') ? media.url : `${apiBaseUrl}${media.url}`
    }))
  };
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  let payload: unknown = {};
  try {
    payload = await response.json();
  } catch {
    // The typed error below is safer than exposing an upstream response body.
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : fallback;
    throw new PublicListingRequestError(message, response.status);
  }

  return payload as T;
}

export async function getPublicListings(
  options: PublicListingsOptions = {}
): Promise<PublicListingsResponse> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  if (options.before) query.set('before', options.before);
  if (options.q) query.set('q', options.q);
  if (options.categoryId) query.set('categoryId', options.categoryId);
  if (options.condition) query.set('condition', options.condition);
  if (options.availabilityStatus) query.set('availabilityStatus', options.availabilityStatus);
  if (options.minPrice !== undefined) query.set('minPrice', String(options.minPrice));
  if (options.maxPrice !== undefined) query.set('maxPrice', String(options.maxPrice));
  if (options.currency) query.set('currency', options.currency.toUpperCase());
  if (options.country) query.set('country', options.country.toUpperCase());
  if (options.region) query.set('region', options.region);
  if (options.city) query.set('city', options.city);
  if (options.suburb) query.set('suburb', options.suburb);
  if (options.fulfilment) query.set('fulfilment', options.fulfilment);
  if (options.sort) query.set('sort', options.sort);

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(`${apiBaseUrl}/v1/listings/search${suffix}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' }
  });
  const payload = await readJson<PublicListingsResponse>(response, 'Unable to load listings');
  return {
    ...payload,
    listings: payload.listings.map(withAbsoluteMediaUrls)
  };
}

export async function getPublicListing(listingId: string): Promise<PublicListingDetail> {
  const response = await fetch(`${apiBaseUrl}/v1/listings/${encodeURIComponent(listingId)}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' }
  });
  const payload = await readJson<{ listing: PublicListingDetail }>(
    response,
    'Unable to load listing'
  );
  return withAbsoluteMediaUrls(payload.listing);
}
