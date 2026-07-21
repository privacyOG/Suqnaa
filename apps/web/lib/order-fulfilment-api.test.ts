import assert from 'node:assert/strict';
import {
  getOrderPaymentContext,
  updateOrderFulfilment
} from './order-fulfilment-api';

async function run() {
  const originalFetch = globalThis.fetch;
  const orderId = '123e4567-e89b-42d3-a456-426614174000';

  try {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith('/payment-context')) {
        return new Response(JSON.stringify({
          orderId,
          paymentContext: {
            paymentIntent: {
              id: '223e4567-e89b-42d3-a456-426614174000',
              rail: 'card',
              status: 'held',
              providerConfigured: true,
              expiresAt: null,
              createdAt: '2026-07-21T10:00:00.000Z',
              updatedAt: '2026-07-21T10:05:00.000Z'
            },
            fulfilment: {
              id: '323e4567-e89b-42d3-a456-426614174000',
              status: 'not_started',
              createdAt: '2026-07-21T10:00:00.000Z',
              updatedAt: '2026-07-21T10:00:00.000Z'
            },
            releaseModel: 'hold_until_fulfilment_or_dispute_resolution',
            operations: {
              collectionEnabled: false,
              releaseEnabled: false
            }
          }
        }), { status: 200 });
      }

      return new Response(JSON.stringify({
        accepted: true,
        orderId,
        fulfilment: {
          id: '323e4567-e89b-42d3-a456-426614174000',
          status: 'shipped',
          carrier: 'Australia Post',
          trackingReference: 'TRACK-123',
          shippedAt: '2026-07-21T11:00:00.000Z',
          deliveredAt: null,
          buyerConfirmedAt: null,
          updatedAt: '2026-07-21T11:00:00.000Z',
          unchanged: false
        },
        payment: { releaseEnabled: false }
      }), { status: 200 });
    }) as typeof fetch;

    const context = await getOrderPaymentContext(orderId);
    assert.equal(context.orderId, orderId);
    assert.equal(context.paymentContext.paymentIntent.status, 'held');
    assert.equal(context.paymentContext.fulfilment.status, 'not_started');
    assert.equal(requests[0]?.url, `/api/authed/v1/market/orders/${orderId}/payment-context`);
    assert.equal(requests[0]?.init?.method, 'GET');
    assert.equal(requests[0]?.init?.credentials, 'same-origin');
    assert.equal(new Headers(requests[0]?.init?.headers).has('authorization'), false);

    const result = await updateOrderFulfilment(
      orderId,
      {
        action: 'shipped',
        carrier: '  Australia Post  ',
        trackingReference: '  TRACK-123  '
      },
      'fulfilment-check'
    );
    assert.equal(result.orderId, orderId);
    assert.equal(result.fulfilment.status, 'shipped');
    assert.equal(result.payment.releaseEnabled, false);
    assert.equal(requests[1]?.url, `/api/authed/v1/market/orders/${orderId}/fulfilment`);
    assert.equal(requests[1]?.init?.method, 'POST');
    assert.equal(
      new Headers(requests[1]?.init?.headers).get('x-suqnaa-human-check'),
      'fulfilment-check'
    );
    assert.equal(new Headers(requests[1]?.init?.headers).has('authorization'), false);
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      action: 'shipped',
      carrier: 'Australia Post',
      trackingReference: 'TRACK-123'
    });

    assert.throws(() => getOrderPaymentContext('not-an-order'), /UUID/);
    assert.throws(
      () => updateOrderFulfilment(orderId, {
        action: 'shipped',
        carrier: 'A',
        trackingReference: 'TRACK-123'
      }),
      /Carrier/
    );
    assert.throws(
      () => updateOrderFulfilment(orderId, {
        action: 'shipped',
        carrier: 'Australia Post',
        trackingReference: 'X'
      }),
      /Tracking/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
