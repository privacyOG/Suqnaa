import assert from 'node:assert/strict';
import { submitListingOffer } from './trading-api';

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        accepted: true,
        idempotent: false,
        offer: {
          id: '123e4567-e89b-42d3-a456-426614174003',
          listingId: '123e4567-e89b-42d3-a456-426614174000',
          buyerId: '123e4567-e89b-42d3-a456-426614174001',
          amount: '80.00',
          currencyCode: 'AUD',
          status: 'pending',
          message: 'Ready to collect this week.',
          clientOfferId: '123e4567-e89b-42d3-a456-426614174002',
          createdAt: '2026-06-22T00:00:00.000Z',
          updatedAt: '2026-06-22T00:00:00.000Z'
        }
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await submitListingOffer({
      listingId: '123e4567-e89b-42d3-a456-426614174000',
      amount: 80,
      currencyCode: 'AUD',
      message: 'Ready to collect this week.',
      clientOfferId: '123e4567-e89b-42d3-a456-426614174002'
    }, 'offer-check');

    assert.equal(capturedUrl, '/api/authed/v1/market/offers');
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(capturedInit?.credentials, 'same-origin');
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get('x-suqnaa-human-check'), 'offer-check');
    assert.equal(headers.has('authorization'), false);
    assert.deepEqual(
      JSON.parse(String(capturedInit?.body)),
      {
        listingId: '123e4567-e89b-42d3-a456-426614174000',
        amount: 80,
        currencyCode: 'AUD',
        message: 'Ready to collect this week.',
        clientOfferId: '123e4567-e89b-42d3-a456-426614174002'
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
