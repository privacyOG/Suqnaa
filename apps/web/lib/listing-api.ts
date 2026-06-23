import { getAuthed, postAuthed, type JsonBody } from './authed-api';

export interface ListingMediaItem {
  id: string;
  url: string | null;
  mimeType: string;
  sortOrder: number;
  createdAt?: string;
}

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

export async function uploadListingMedia(
  listingId: string,
  file: File
): Promise<{ media: ListingMediaItem }> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(
    `/api/upload/${encodeURIComponent(listingId)}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      body: form
    }
  );

  if (!response.ok) {
    let message = 'Photo upload failed';
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch { /* ignore */ }
    throw new Error(message);
  }

  return response.json() as Promise<{ media: ListingMediaItem }>;
}

export function deleteListingMedia(
  listingId: string,
  mediaId: string
): Promise<{ deleted: boolean }> {
  return postAuthed<{ deleted: boolean }>(
    `/v1/listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}/delete`,
    {}
  );
}
