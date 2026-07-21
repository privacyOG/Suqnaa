import assert from 'node:assert/strict';
import {
  canCancelPendingOrder,
  cancellationSuccessMessage
} from './order-cancellation-presentation';

assert.equal(canCancelPendingOrder('buyer', 'pending'), true);
assert.equal(canCancelPendingOrder('seller', 'pending'), false);
assert.equal(canCancelPendingOrder('buyer', 'paid'), false);
assert.equal(canCancelPendingOrder('buyer', 'cancelled'), false);

assert.equal(
  cancellationSuccessMessage(false, false),
  'The order and offer were cancelled, and the listing is available again.'
);
assert.equal(
  cancellationSuccessMessage(true, false),
  'The order was already cancelled. No additional changes were made.'
);
assert.match(cancellationSuccessMessage(false, true), /أُلغي الطلب/);
