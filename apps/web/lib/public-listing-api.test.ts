import assert from 'node:assert/strict';
import {
  getPublicListing,
  getPublicListings,
  PublicListingRequestError
} from './public-listing-api';

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        listings: [],
        pagination: { hasMore: false, nextCursor: null }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await getPublicListings({
      limit: 24,
      before: '2026-06-22T00:00:00.000Z',
      q: 'phone case',
      categoryId: '123e4567-e89b-42d3-a456-426614174002',
      condition: 'good',
      availabilityStatus: 'in_stock',
      minPrice: 10,
      maxPrice: 250,
      currency: 'AUD',
      country: 'AU',
      city: 'Sydney',
      fulfilment: 'delivery'
    });
    assert.equal(
      capturedUrl,
      'http://localhost:4000/v1/listings/search?limit=24&before=2026-06-22T00%3A00%3A00.000Z&q=phone+case&categoryId=123e4567-e89b-42d3-a456-426614174002&condition=good&availabilityStatus=in_stock&minPrice=10&maxPrice=250&currency=AUD&country=AU&city=Sydney&fulfilment=delivery'
    );
    assert.equal(capturedInit?.cache, 'no-store');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);

    const listingId = '123e4567-e89b-42d3-a456-426614174000';
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        listing: {
          id: listingId,
          title: 'Test item',
          description: 'A public listing description.',
          priceAmount: '100.00',
          currencyCode: 'AUD',
          condition: 'good',
          status: 'active',
          countryCode: 'AU',
          region: 'NSW',
          city: 'Sydney',
          suburb: 'Greenacre',
          allowPickup: true,
          allowDelivery: false,
          publishedAt: null,
          expiresAt: null,
          createdAt: '2026-06-22T00:00:00.000Z',
          updatedAt: '2026-06-22T00:00:00.000Z',
          mediaCount: 0,
          category: null,
          seller: {
            id: '123e4567-e89b-42d3-a456-426614174001',
            displayName: 'Seller',
            status: 'active',
            emailVerified: true,
            phoneVerified: false,
            trustScore: 0,
            isBusiness: false,
            businessName: null,
            city: null,
            countryCode: null,
            verification: {
              status: 'unverified',
              level: null,
              reviewedAt: null,
              expiresAt: null
            }
          }
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    const listing = await getPublicListing(listingId);
    assert.equal(listing.id, listingId);
    assert.equal(capturedUrl, `http://localhost:4000/v1/listings/${listingId}`);
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);

    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: 'Listing not found' }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' }
      }
    )) as typeof fetch;

    await assert.rejects(
      () => getPublicListing(listingId),
      (error: unknown) => {
        assert.ok(error instanceof PublicListingRequestError);
        assert.equal(error.status, 404);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
