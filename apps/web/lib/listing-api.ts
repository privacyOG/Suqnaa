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

export function createListingDraft(accessToken: string, input: ListingDraftInput) {
  return postAuthed('/v1/listings', accessToken, input);
}
