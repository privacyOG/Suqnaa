import assert from 'node:assert/strict';
import { getOrderActivity, getOrderActivityDetail } from './order-activity-api';

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        orders: [],
        pagination: { hasMore: false, nextCursor: null }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await getOrderActivity({
      status: 'paid',
      limit: 20,
      before: '2026-06-22T00:00:00.000Z'
    });

    assert.equal(
      capturedUrl,
      '/api/authed/v1/market/orders?status=paid&limit=20&before=2026-06-22T00%3A00%3A00.000Z'
    );
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);

    const orderId = '123e4567-e89b-42d3-a456-426614174000';
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        order: {
          id: orderId,
          status: 'pending'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await getOrderActivityDetail(orderId);
    assert.equal(capturedUrl, `/api/authed/v1/market/orders/${orderId}`);
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
