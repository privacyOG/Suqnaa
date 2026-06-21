import { postAuthed, type JsonBody } from './authed-api';

export interface ListingDraftInput extends JsonBody {
  categoryId?: string;
  title: string;
  description: string;
  priceAmount: number;
  currencyCode: string;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'parts_or_repair';
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
    status: string;
    created_at: string;
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
