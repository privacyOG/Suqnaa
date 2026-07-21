import {
  getAuthed,
  postAuthed,
  postAuthedBinary,
  type JsonBody
} from './authed-api';

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

export interface ListingMediaUploadInput {
  image: Blob;
  width?: number;
  height?: number;
  altText?: string;
  sortOrder?: number;
}

export interface ListingMediaUploadResponse {
  media: ListingMedia;
  mediaCount: number;
}

export interface ListingMediaDeleteResponse {
  deleted: boolean;
  mediaId: string;
  mediaCount: number;
}

export interface OwnerListingMediaResponse {
  listing: {
    id: string;
    title: string;
    status: ListingStatus;
  };
  media: ListingMedia[];
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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value: string, label: string): string {
  const normalized = value.trim();
  if (!uuidPattern.test(normalized)) {
    throw new Error(`${label} must be a UUID`);
  }
  return normalized;
}

function withAbsoluteMediaUrl(media: ListingMedia): ListingMedia {
  return {
    ...media,
    url: media.url.startsWith('http') ? media.url : `${apiBaseUrl}${media.url}`
  };
}

function withOwnerMediaUrl(media: ListingMedia): ListingMedia {
  if (!media.url.startsWith('/v1/')) {
    throw new Error('Owner media URL must be an API path');
  }
  return {
    ...media,
    url: `/api/authed${media.url}`
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
  const normalizedListingId = requiredUuid(listingId, 'Listing identifier');
  const query = new URLSearchParams();

  if (input.width !== undefined) {
    query.set('width', String(input.width));
  }
  if (input.height !== undefined) {
    query.set('height', String(input.height));
  }
  if (input.altText) {
    query.set('altText', input.altText);
  }
  if (input.sortOrder !== undefined) {
    query.set('sortOrder', String(input.sortOrder));
  }

  const encoded = query.toString();
  const path = `/v1/listings/${normalizedListingId}/media/upload${encoded ? `?${encoded}` : ''}`;
  const response = await postAuthedBinary<ListingMediaUploadResponse>(
    path,
    input.image,
    challengeResponse
  );

  return {
    ...response,
    media: withAbsoluteMediaUrl(response.media)
  };
}

export function deleteListingMedia(
  listingId: string,
  mediaId: string,
  challengeResponse?: string
): Promise<ListingMediaDeleteResponse> {
  const normalizedListingId = requiredUuid(listingId, 'Listing identifier');
  const normalizedMediaId = requiredUuid(mediaId, 'Media identifier');
  return postAuthed<ListingMediaDeleteResponse>(
    `/v1/listings/${normalizedListingId}/media/${normalizedMediaId}/delete`,
    {},
    challengeResponse
  );
}

export async function getMyListingMedia(
  listingId: string
): Promise<OwnerListingMediaResponse> {
  const normalizedListingId = requiredUuid(listingId, 'Listing identifier');
  const response = await getAuthed<OwnerListingMediaResponse>(
    `/v1/listings/${normalizedListingId}/media/mine`
  );
  if (response.listing.id !== normalizedListingId) {
    throw new Error('Owner media response listing mismatch');
  }
  if (response.mediaCount !== response.media.length || response.media.length > 8) {
    throw new Error('Owner media response count mismatch');
  }
  return {
    ...response,
    media: response.media.map(withOwnerMediaUrl)
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
  const normalizedListingId = requiredUuid(listingId, 'Listing identifier');
  return postAuthed<ListingStatusResponse>(
    `/v1/listings/${normalizedListingId}/status`,
    { status },
    challengeResponse
  );
}
