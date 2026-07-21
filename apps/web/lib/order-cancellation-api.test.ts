import assert from 'node:assert/strict';
import { cancelPendingOrder } from './order-cancellation-api';

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const orderId = '123e4567-e89b-42d3-a456-426614174000';

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        accepted: true,
        order: {
          id: orderId,
          status: 'cancelled',
          updatedAt: '2026-07-21T09:45:00.000Z'
        },
        cancellation: {
          unchanged: false
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    const response = await cancelPendingOrder(orderId, 'order-cancel-check');

    assert.equal(
      capturedUrl,
      `/api/authed/v1/market/orders/${orderId}/cancel`
    );
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(
      new Headers(capturedInit?.headers).get('x-suqnaa-human-check'),
      'order-cancel-check'
    );
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {});
    assert.equal(response.order.id, orderId);
    assert.equal(response.order.status, 'cancelled');
    assert.equal(response.cancellation.unchanged, false);

    assert.throws(
      () => cancelPendingOrder('not-an-order'),
      /UUID/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
