import assert from 'node:assert/strict';
import { evaluateOrderCancellation } from './order-cancellation.js';

const order = {
  id: 'order-1',
  buyerId: 'buyer-1',
  sellerId: 'seller-1',
  listingId: 'listing-1',
  offerId: 'offer-1',
  status: 'pending',
  paymentProvider: null,
  paymentReference: null
};

const offer = {
  id: 'offer-1',
  listingId: 'listing-1',
  buyerId: 'buyer-1',
  status: 'accepted'
};

const listing = {
  id: 'listing-1',
  sellerId: 'seller-1',
  status: 'reserved'
};

assert.deepEqual(
  evaluateOrderCancellation({
    actorId: 'buyer-1',
    order,
    offer,
    listing
  }),
  { allowed: true, unchanged: false }
);

assert.deepEqual(
  evaluateOrderCancellation({
    actorId: 'buyer-1',
    order: { ...order, status: 'cancelled' }
  }),
  { allowed: true, unchanged: true }
);

assert.deepEqual(
  evaluateOrderCancellation({
    actorId: 'other-buyer',
    order,
    offer,
    listing
  }),
  {
    allowed: false,
    statusCode: 404,
    payload: { error: 'Order not found' }
  }
);

assert.deepEqual(
  evaluateOrderCancellation({
    actorId: 'buyer-1',
    order: { ...order, status: 'paid' },
    offer,
    listing
  }),
  {
    allowed: false,
    statusCode: 409,
    payload: {
      error: 'Only pending orders can be cancelled',
      currentStatus: 'paid'
    }
  }
);

assert.deepEqual(
  evaluateOrderCancellation({
    actorId: 'buyer-1',
    order: { ...order, paymentProvider: 'configured' },
    offer,
    listing
  }),
  {
    allowed: false,
    statusCode: 409,
    payload: { error: 'Order payment processing has started' }
  }
);

assert.deepEqual(
  evaluateOrderCancellation({
    actorId: 'buyer-1',
    order,
    offer: { ...offer, status: 'cancelled' },
    listing
  }),
  {
    allowed: false,
    statusCode: 409,
    payload: { error: 'Order offer is no longer cancellable' }
  }
);

assert.deepEqual(
  evaluateOrderCancellation({
    actorId: 'buyer-1',
    order,
    offer,
    listing: { ...listing, status: 'active' }
  }),
  {
    allowed: false,
    statusCode: 409,
    payload: { error: 'Order reservation is no longer available' }
  }
);
