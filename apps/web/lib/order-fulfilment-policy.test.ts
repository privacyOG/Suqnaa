import assert from 'node:assert/strict';
import { resolveProtectedRoute } from './protected-route-policy';

const orderId = '123e4567-e89b-42d3-a456-426614174000';

assert.deepEqual(
  resolveProtectedRoute(
    'GET',
    ['v1', 'market', 'orders', orderId, 'payment-context'],
    new URLSearchParams()
  ),
  {
    method: 'GET',
    path: `/v1/market/orders/${orderId}/payment-context`,
    query: ''
  }
);
assert.deepEqual(
  resolveProtectedRoute(
    'POST',
    ['v1', 'market', 'orders', orderId, 'fulfilment'],
    new URLSearchParams()
  ),
  {
    method: 'POST',
    path: `/v1/market/orders/${orderId}/fulfilment`,
    query: ''
  }
);
assert.equal(
  resolveProtectedRoute(
    'GET',
    ['v1', 'market', 'orders', orderId, 'fulfilment'],
    new URLSearchParams()
  ),
  null
);
assert.equal(
  resolveProtectedRoute(
    'POST',
    ['v1', 'market', 'orders', orderId, 'payment-context'],
    new URLSearchParams()
  ),
  null
);
assert.equal(
  resolveProtectedRoute(
    'POST',
    ['v1', 'market', 'orders', 'not-a-uuid', 'fulfilment'],
    new URLSearchParams()
  ),
  null
);
assert.equal(
  resolveProtectedRoute(
    'POST',
    ['v1', 'market', 'orders', orderId, 'fulfilment'],
    new URLSearchParams('release=true')
  ),
  null
);
assert.equal(
  resolveProtectedRoute(
    'GET',
    ['v1', 'market', 'orders', orderId, 'payment-context'],
    new URLSearchParams('providerReference=secret')
  ),
  null
);
