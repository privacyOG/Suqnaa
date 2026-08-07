import assert from 'node:assert/strict';
import {
  getListingLifecycle,
  renewListingLifecycle
} from './listing-lifecycle-api';

const listingId = '123e4567-e89b-42d3-a456-426614174000';

async function run() {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  try {
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        listing: {
          id: listingId,
          title: 'Lifecycle listing',
          status: 'active',
          availabilityStatus: 'limited',
          availableQuantity: 2,
          expiresAt: '2026-09-07T00:00:00.000Z',
          lastRenewedAt: null,
          version: 4,
          updatedAt: '2026-08-08T00:00:00.000Z'
        },
        renewable: true,
        renewalAvailableAt: '2026-08-31T00:00:00.000Z',
        activeDays: 30
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const snapshot = await getListingLifecycle(listingId);
    assert.equal(capturedUrl, `/api/authed/v1/listings/${listingId}/lifecycle`);
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(snapshot.listing.version, 4);
    assert.equal(snapshot.renewable, true);

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        listing: {
          ...snapshot.listing,
          version: 5,
          expiresAt: '2026-10-07T00:00:00.000Z'
        },
        reactivated: false
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const renewed = await renewListingLifecycle(listingId, 4);
    assert.equal(capturedUrl, `/api/authed/v1/listings/${listingId}/renew`);
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { version: 4 });
    assert.equal(renewed.listing.version, 5);

    assert.throws(() => getListingLifecycle('not-a-listing'), /UUID/);
    assert.throws(() => renewListingLifecycle(listingId, 0), /positive integer/);
    assert.throws(() => renewListingLifecycle('not-a-listing', 1), /UUID/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
