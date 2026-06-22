import { getAuthed } from './authed-api';

export type OrderActivityStatus =
  | 'pending'
  | 'paid'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'cancelled';

export type OrderProgressStage =
  | 'payment_pending'
  | 'fulfilment'
  | 'complete'
  | 'disputed'
  | 'refunded'
  | 'cancelled';

export type OrderProgressStepKey = 'created' | 'paid' | 'fulfilment' | 'complete';
export type OrderProgressStepState = 'complete' | 'current' | 'upcoming' | 'exception';

export interface OrderActivityItem {
  id: string;
  offerId: string | null;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: string | number;
  currencyCode: string;
  status: OrderActivityStatus;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
  role: 'buyer' | 'seller';
  progress: {
    stage: OrderProgressStage;
    percent: number;
    terminal: boolean;
    steps: Array<{
      key: OrderProgressStepKey;
      state: OrderProgressStepState;
    }>;
  };
  listing: {
    id: string;
    title: string;
    status: string;
    priceAmount: string | number;
    currencyCode: string;
  } | null;
  counterpart: {
    id: string;
    displayName: string;
    status: string;
  } | null;
  offer: {
    id: string;
    status: string;
    message: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export interface OrderActivityPage {
  orders: OrderActivityItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface OrderActivityPageOptions {
  status?: OrderActivityStatus;
  limit?: number;
  before?: string;
}

export interface OrderActivityDetailResponse {
  order: OrderActivityItem;
}

function pagePath(options: OrderActivityPageOptions = {}): string {
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
  return query.toString() ? `/v1/market/orders?${query.toString()}` : '/v1/market/orders';
}

export function getOrderActivity(
  options: OrderActivityPageOptions = {}
): Promise<OrderActivityPage> {
  return getAuthed<OrderActivityPage>(pagePath(options));
}

export function getOrderActivityDetail(orderId: string): Promise<OrderActivityDetailResponse> {
  return getAuthed<OrderActivityDetailResponse>(
    `/v1/market/orders/${encodeURIComponent(orderId)}`
  );
}
