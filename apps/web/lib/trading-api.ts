import { postAuthed, type JsonBody } from './authed-api';

export interface CardIntentResponse {
  clientSecret: string;
}

export function createCardIntent(orderId: string): Promise<CardIntentResponse> {
  return postAuthed<CardIntentResponse>('/v1/checkout/card-intent', { orderId });
}

export interface ListingOfferInput extends JsonBody {
  listingId: string;
  amount: number;
  currencyCode: string;
  message?: string;
  clientOfferId: string;
}

export interface ListingOfferResponse {
  accepted: boolean;
  idempotent: boolean;
  offer: {
    id: string;
    listingId: string;
    buyerId: string;
    amount: string | number;
    currencyCode: string;
    status: string;
    message: string | null;
    clientOfferId: string;
    createdAt: string;
    updatedAt: string;
  };
}

export function createTimedSale(
  input: JsonBody,
  challengeResponse?: string
): Promise<Record<string, unknown>> {
  return postAuthed(
    '/v1/market/timed-sale',
    input,
    challengeResponse
  );
}

export function submitListingOffer(
  input: ListingOfferInput,
  challengeResponse?: string
): Promise<ListingOfferResponse> {
  return postAuthed<ListingOfferResponse>(
    '/v1/market/offers',
    input,
    challengeResponse
  );
}

export function submitReview(
  input: JsonBody,
  challengeResponse?: string
): Promise<Record<string, unknown>> {
  return postAuthed(
    '/v1/market/reviews',
    input,
    challengeResponse
  );
}
