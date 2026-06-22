export type PublicListingCondition =
  | 'new'
  | 'like_new'
  | 'good'
  | 'fair'
  | 'parts_or_repair';

export interface PublicSellerSummary {
  id: string;
  displayName: string;
  status: string;
}

export interface PublicListingSummary {
  id: string;
  title: string;
  description: string;
  priceAmount: string | number;
  currencyCode: string;
  condition: PublicListingCondition;
  countryCode: string;
  region: string | null;
  city: string | null;
  suburb: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
  publishedAt: string | null;
  createdAt: string;
  seller: PublicSellerSummary | null;
}

export interface PublicListingDetail extends Omit<PublicListingSummary, 'seller'> {
  status: 'active';
  expiresAt: string | null;
  updatedAt: string;
  mediaCount: number;
  category: {
    id: string;
    slug: string;
    nameEn: string;
    nameAr: string | null;
  } | null;
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

export async function getPublicListings(options: {
  limit?: number;
  before?: string;
} = {}): Promise<PublicListingsResponse> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) {
    query.set('limit', String(options.limit));
  }
  if (options.before) {
    query.set('before', options.before);
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(`${apiBaseUrl}/v1/listings${suffix}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' }
  });
  return readJson<PublicListingsResponse>(response, 'Unable to load listings');
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
  return payload.listing;
}
