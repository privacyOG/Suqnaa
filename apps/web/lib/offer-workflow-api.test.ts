import assert from 'node:assert/strict';
import {
  cancelOffer,
  createAcceptedOfferOrder,
  decideOffer,
  getIncomingOffers,
  getMyOffers
} from './offer-workflow-api';

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        offers: [],
        pagination: { hasMore: false, nextCursor: null }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await getIncomingOffers({
      status: 'pending',
      limit: 20,
      before: '2026-06-22T00:00:00.000Z'
    });
    assert.equal(
      capturedUrl,
      '/api/authed/v1/market/offers/incoming?status=pending&limit=20&before=2026-06-22T00%3A00%3A00.000Z'
    );
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);

    await getMyOffers({ limit: 10 });
    assert.equal(capturedUrl, '/api/authed/v1/market/offers/mine?limit=10');

    const offerId = '123e4567-e89b-42d3-a456-426614174000';
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        offer: { id: offerId, status: 'accepted', unchanged: false }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await decideOffer(offerId, 'accepted', 'manage-check');
    assert.equal(capturedUrl, `/api/authed/v1/market/offers/${offerId}/status`);
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(new Headers(capturedInit?.headers).get('x-suqnaa-human-check'), 'manage-check');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { status: 'accepted' });

    await cancelOffer(offerId, 'cancel-check');
    assert.equal(capturedUrl, `/api/authed/v1/market/offers/${offerId}/cancel`);
    assert.equal(new Headers(capturedInit?.headers).get('x-suqnaa-human-check'), 'cancel-check');
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {});

    const clientOrderId = '123e4567-e89b-42d3-a456-426614174001';
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        accepted: true,
        idempotent: false,
        order: {
          id: '123e4567-e89b-42d3-a456-426614174002',
          offerId,
          listingId: '123e4567-e89b-42d3-a456-426614174003',
          buyerId: '123e4567-e89b-42d3-a456-426614174004',
          sellerId: '123e4567-e89b-42d3-a456-426614174005',
          amount: '80.00',
          currencyCode: 'AUD',
          status: 'pending',
          paymentMethod: 'bank_transfer',
          clientOrderId,
          createdAt: '2026-06-22T00:00:00.000Z',
          updatedAt: '2026-06-22T00:00:00.000Z'
        }
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await createAcceptedOfferOrder({
      offerId,
      paymentMethod: 'bank_transfer',
      clientOrderId
    }, 'order-check');
    assert.equal(capturedUrl, '/api/authed/v1/market/orders');
    assert.equal(new Headers(capturedInit?.headers).get('x-suqnaa-human-check'), 'order-check');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      offerId,
      paymentMethod: 'bank_transfer',
      clientOrderId
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
