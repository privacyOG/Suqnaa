import { getAuthed, postAuthed, type JsonBody } from './authed-api';

export type OfferWorkflowStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface OfferWorkflowOrder {
  id: string;
  offerId: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  amount: string | number;
  currencyCode: string;
  status: string;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfferWorkflowItem {
  id: string;
  listingId: string;
  buyerId: string;
  amount: string | number;
  currencyCode: string;
  status: OfferWorkflowStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  listing: {
    id: string;
    title: string;
    status: string;
    priceAmount: string | number;
    currencyCode: string;
  };
  counterpart: {
    id: string;
    displayName: string;
    status: string;
  } | null;
  order: OfferWorkflowOrder | null;
}

export interface OfferWorkflowPage {
  offers: OfferWorkflowItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface OfferWorkflowPageOptions {
  status?: OfferWorkflowStatus;
  limit?: number;
  before?: string;
}

export interface OfferDecisionResponse {
  offer: {
    id: string;
    listingId?: string;
    buyerId?: string;
    amount?: string | number;
    currencyCode?: string;
    status: OfferWorkflowStatus;
    updatedAt?: string | null;
    unchanged: boolean;
  };
}

export interface AcceptedOfferOrderInput extends JsonBody {
  offerId: string;
  paymentMethod: 'card' | 'bank_transfer' | 'wallet' | 'xmr';
  clientOrderId: string;
}

export interface AcceptedOfferOrderResponse {
  accepted: boolean;
  idempotent: boolean;
  order: OfferWorkflowOrder & {
    clientOrderId: string;
  };
}

function pagePath(path: string, options: OfferWorkflowPageOptions = {}) {
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
  return query.toString() ? `${path}?${query.toString()}` : path;
}

export function getIncomingOffers(
  options: OfferWorkflowPageOptions = {}
): Promise<OfferWorkflowPage> {
  return getAuthed<OfferWorkflowPage>(
    pagePath('/v1/market/offers/incoming', options)
  );
}

export function getMyOffers(
  options: OfferWorkflowPageOptions = {}
): Promise<OfferWorkflowPage> {
  return getAuthed<OfferWorkflowPage>(
    pagePath('/v1/market/offers/mine', options)
  );
}

export function decideOffer(
  offerId: string,
  status: 'accepted' | 'rejected',
  challengeResponse?: string
): Promise<OfferDecisionResponse> {
  return postAuthed<OfferDecisionResponse>(
    `/v1/market/offers/${encodeURIComponent(offerId)}/status`,
    { status },
    challengeResponse
  );
}

export function cancelOffer(
  offerId: string,
  challengeResponse?: string
): Promise<OfferDecisionResponse> {
  return postAuthed<OfferDecisionResponse>(
    `/v1/market/offers/${encodeURIComponent(offerId)}/cancel`,
    {},
    challengeResponse
  );
}

export function createAcceptedOfferOrder(
  input: AcceptedOfferOrderInput,
  challengeResponse?: string
): Promise<AcceptedOfferOrderResponse> {
  return postAuthed<AcceptedOfferOrderResponse>(
    '/v1/market/orders',
    input,
    challengeResponse
  );
}
