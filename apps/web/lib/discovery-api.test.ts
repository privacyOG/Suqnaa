import assert from 'node:assert/strict';
import {
  createDiscoverySavedSearch,
  getDiscoveryState,
  getSavedSearchNotifications,
  recordDiscoveryView,
  saveDiscoveryListing,
  watchDiscoveryListing
} from './discovery-api';

const listingId = '123e4567-e89b-42d3-a456-426614174000';

async function run() {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  try {
    globalThis.fetch = (async (input, init) => {
      requests.push({ url: String(input), init });
      const url = String(input);
      if (url.includes('/state')) {
        return new Response(JSON.stringify({ state: { listingId, saved: false, watching: true } }), { status: 200 });
      }
      if (url.includes('/notifications?')) {
        return new Response(JSON.stringify({ notifications: [] }), { status: 200 });
      }
      if (url.endsWith('/saved-searches')) {
        return new Response(JSON.stringify({ search: { id: listingId } }), { status: 201 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const state = await getDiscoveryState(listingId);
    assert.equal(state.watching, true);
    await saveDiscoveryListing(listingId);
    await watchDiscoveryListing(listingId);
    await recordDiscoveryView(listingId);
    await createDiscoverySavedSearch('Sydney', {
      q: 'laptop',
      country: 'AU',
      city: 'Sydney',
      minPrice: 10,
      maxPrice: 2000,
      currency: 'AUD',
      fulfilment: 'both'
    });
    await getSavedSearchNotifications(true, 25);

    assert.equal(requests[0]?.url, `/api/authed/v1/discovery/listings/${listingId}/state`);
    assert.equal(requests[1]?.url, `/api/authed/v1/discovery/saved-listings/${listingId}/save`);
    assert.equal(requests[2]?.url, `/api/authed/v1/discovery/watchlist/${listingId}/watch`);
    assert.equal(requests[3]?.url, `/api/authed/v1/discovery/recently-viewed/${listingId}/view`);
    assert.equal(requests[4]?.url, '/api/authed/v1/discovery/saved-searches');
    assert.deepEqual(JSON.parse(String(requests[4]?.init?.body)), {
      name: 'Sydney',
      filters: {
        q: 'laptop',
        country: 'AU',
        city: 'Sydney',
        minPrice: 10,
        maxPrice: 2000,
        currency: 'AUD',
        fulfilment: 'both'
      }
    });
    assert.equal(requests[5]?.url, '/api/authed/v1/discovery/notifications?limit=25&unreadOnly=true');
    assert.ok(requests.slice(1, 5).every((request) => request.init?.method === 'POST'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
