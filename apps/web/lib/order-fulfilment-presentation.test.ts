import assert from 'node:assert/strict';
import {
  availableFulfilmentActions,
  fulfilmentStatusLabel,
  fulfilmentSuccessMessage
} from './order-fulfilment-presentation';
import type { OrderPaymentContextResponse } from './order-fulfilment-api';

function context(
  fulfilmentStatus: OrderPaymentContextResponse['paymentContext']['fulfilment']['status'],
  overrides: Partial<OrderPaymentContextResponse['paymentContext']['paymentIntent']> = {}
): OrderPaymentContextResponse {
  return {
    orderId: '123e4567-e89b-42d3-a456-426614174000',
    paymentContext: {
      paymentIntent: {
        id: '223e4567-e89b-42d3-a456-426614174000',
        rail: 'card',
        status: 'held',
        providerConfigured: true,
        expiresAt: null,
        createdAt: '2026-07-21T10:00:00.000Z',
        updatedAt: '2026-07-21T10:00:00.000Z',
        ...overrides
      },
      fulfilment: {
        id: '323e4567-e89b-42d3-a456-426614174000',
        status: fulfilmentStatus,
        createdAt: '2026-07-21T10:00:00.000Z',
        updatedAt: '2026-07-21T10:00:00.000Z'
      },
      releaseModel: 'hold_until_fulfilment_or_dispute_resolution',
      operations: {
        collectionEnabled: false,
        releaseEnabled: false
      }
    }
  };
}

assert.deepEqual(
  availableFulfilmentActions(
    { role: 'seller', status: 'paid' },
    context('not_started')
  ),
  ['ready_for_pickup', 'shipped']
);
assert.deepEqual(
  availableFulfilmentActions(
    { role: 'buyer', status: 'paid' },
    context('shipped')
  ),
  ['confirm_received']
);
assert.deepEqual(
  availableFulfilmentActions(
    { role: 'buyer', status: 'paid' },
    context('delivered')
  ),
  ['confirm_received']
);
assert.deepEqual(
  availableFulfilmentActions(
    { role: 'seller', status: 'pending' },
    context('not_started')
  ),
  []
);
assert.deepEqual(
  availableFulfilmentActions(
    { role: 'seller', status: 'paid' },
    context('not_started', { status: 'created' })
  ),
  []
);
assert.deepEqual(
  availableFulfilmentActions(
    { role: 'seller', status: 'paid' },
    context('not_started', { providerConfigured: false })
  ),
  []
);
assert.deepEqual(
  availableFulfilmentActions(
    { role: 'buyer', status: 'paid' },
    context('not_started')
  ),
  []
);
assert.equal(fulfilmentStatusLabel('ready_for_pickup', false), 'Ready for pickup');
assert.equal(fulfilmentStatusLabel('ready_for_pickup', true), 'جاهز للاستلام');
assert.match(fulfilmentSuccessMessage('confirm_received', false, false), /not released/i);
assert.match(fulfilmentSuccessMessage('confirm_received', false, true), /لا يتم تحرير/);
assert.match(fulfilmentSuccessMessage('shipped', true, false), /already recorded/i);
