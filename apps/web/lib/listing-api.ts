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

export interface ListingDraftInput extends JsonBody {
  categoryId?: string;
  title: string;
  description: string;
  priceAmount: number;
  currencyCode: string;
  condition: ListingCondition;
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

export interface SellerListing {
  id: string;
  title: string;
  description: string;
  priceAmount: string | number;
  currencyCode: string;
  condition: ListingCondition;
  status: ListingStatus;
  countryCode: string;
  region: string | null;
  city: string | null;
  suburb: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
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

export function getMyListings(
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
  return getAuthed<MyListingsResponse>(
    encoded ? `/v1/listings/mine?${encoded}` : '/v1/listings/mine'
  );
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
