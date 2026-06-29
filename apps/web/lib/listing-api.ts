import { getAuthed, postAuthed, type JsonBody } from './authed-api';

export type ListingCondition =
  | 'new'
  | 'like_new'
  | 'good'
  | 'fair'
  | 'parts_or_repair';

export type ListingStatus =
  | 'draft'
  | 'active'
  | 'reserved'
  | 'sold'
  | 'expired'
  | 'removed';

export type ListingAvailabilityStatus =
  | 'in_stock'
  | 'limited'
  | 'out_of_stock'
  | 'service_available';

export interface ListingMedia {
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

export interface ListingDraftInput extends JsonBody {
  categoryId?: string;
  title: string;
  description: string;
  priceAmount: number;
  currencyCode: string;
  condition: ListingCondition;
  availabilityStatus?: ListingAvailabilityStatus;
  availableQuantity?: number;
  unitLabel?: string;
  countryCode: string;
  region?: string;
  city?: string;
  suburb?: string;
  allowPickup?: boolean;
  allowDelivery?: boolean;
}

export interface ListingDraftResponse {
  listing: {
    id: string;
    title: string;
    status: ListingStatus;
    created_at: string;
  };
}

export interface ListingMediaUploadInput extends JsonBody {
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  base64Data: string;
  width?: number;
  height?: number;
  altText?: string;
  sortOrder?: number;
}

export interface ListingMediaUploadResponse {
  media: ListingMedia;
  mediaCount: number;
}

export interface SellerListing {
  id: string;
  title: string;
  description: string;
  priceAmount: string | number;
  currencyCode: string;
  condition: ListingCondition;
  availabilityStatus: ListingAvailabilityStatus;
  availableQuantity: number | null;
  unitLabel: string | null;
  status: ListingStatus;
  countryCode: string;
  region: string | null;
  city: string | null;
  suburb: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
  media: ListingMedia[];
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MyListingsResponse {
  listings: SellerListing[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface MyListingsOptions {
  status?: ListingStatus;
  limit?: number;
  before?: string;
}

export interface ListingStatusResponse {
  listing: {
    id: string;
    title?: string;
    status: ListingStatus;
    updatedAt?: string;
    unchanged: boolean;
  };
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

function withAbsoluteMediaUrl(media: ListingMedia): ListingMedia {
  return {
    ...media,
    url: media.url.startsWith('http') ? media.url : `${apiBaseUrl}${media.url}`
  };
}

function normalizeListingMedia(listing: SellerListing): SellerListing {
  return {
    ...listing,
    media: listing.media.map(withAbsoluteMediaUrl)
  };
}

export function createListingDraft(
  input: ListingDraftInput,
  challengeResponse?: string
): Promise<ListingDraftResponse> {
  return postAuthed<ListingDraftResponse>(
    '/v1/listings',
    input,
    challengeResponse
  );
}

export async function uploadListingMedia(
  listingId: string,
  input: ListingMediaUploadInput,
  challengeResponse?: string
): Promise<ListingMediaUploadResponse> {
  const response = await postAuthed<ListingMediaUploadResponse>(
    `/v1/listings/${encodeURIComponent(listingId)}/media`,
    input,
    challengeResponse
  );
  return {
    ...response,
    media: withAbsoluteMediaUrl(response.media)
  };
}

export async function getMyListings(
  options: MyListingsOptions = {}
): Promise<MyListingsResponse> {
  const query = new URLSearchParams();

  if (options.status) {
    query.set('status', options.status);
  }
  if (options.limit !== undefined) {
    query.set('limit', String(options.limit));
  }
  if (options.before) {
    query.set('before', options.before);
  }

  const encoded = query.toString();
  const response = await getAuthed<MyListingsResponse>(
    encoded ? `/v1/listings/mine?${encoded}` : '/v1/listings/mine'
  );
  return {
    ...response,
    listings: response.listings.map(normalizeListingMedia)
  };
}

export function updateListingStatus(
  listingId: string,
  status: ListingStatus,
  challengeResponse?: string
): Promise<ListingStatusResponse> {
  return postAuthed<ListingStatusResponse>(
    `/v1/listings/${encodeURIComponent(listingId)}/status`,
    { status },
    challengeResponse
  );
}
