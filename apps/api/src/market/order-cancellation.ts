export interface OrderCancellationOrder {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  offerId: string | null;
  status: string;
  paymentProvider: string | null;
  paymentReference: string | null;
}

export interface OrderCancellationOffer {
  id: string;
  listingId: string;
  buyerId: string;
  status: string;
}

export interface OrderCancellationListing {
  id: string;
  sellerId: string;
  status: string;
}

export type OrderCancellationDecision =
  | {
      allowed: true;
      unchanged: boolean;
    }
  | {
      allowed: false;
      statusCode: 404 | 409;
      payload: Record<string, unknown>;
    };

export function evaluateOrderCancellation(input: {
  actorId: string;
  order?: OrderCancellationOrder;
  offer?: OrderCancellationOffer;
  listing?: OrderCancellationListing;
}): OrderCancellationDecision {
  const { actorId, order, offer, listing } = input;

  if (!order || order.buyerId !== actorId) {
    return {
      allowed: false,
      statusCode: 404,
      payload: { error: 'Order not found' }
    };
  }

  if (order.status === 'cancelled') {
    return { allowed: true, unchanged: true };
  }

  if (order.status !== 'pending') {
    return {
      allowed: false,
      statusCode: 409,
      payload: {
        error: 'Only pending orders can be cancelled',
        currentStatus: order.status
      }
    };
  }

  if (order.paymentProvider || order.paymentReference) {
    return {
      allowed: false,
      statusCode: 409,
      payload: { error: 'Order payment processing has started' }
    };
  }

  if (
    !order.offerId ||
    !offer ||
    offer.id !== order.offerId ||
    offer.listingId !== order.listingId ||
    offer.buyerId !== order.buyerId ||
    offer.status !== 'accepted'
  ) {
    return {
      allowed: false,
      statusCode: 409,
      payload: { error: 'Order offer is no longer cancellable' }
    };
  }

  if (
    !listing ||
    listing.id !== order.listingId ||
    listing.sellerId !== order.sellerId ||
    listing.status !== 'reserved'
  ) {
    return {
      allowed: false,
      statusCode: 409,
      payload: { error: 'Order reservation is no longer available' }
    };
  }

  return { allowed: true, unchanged: false };
}
