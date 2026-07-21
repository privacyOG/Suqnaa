import assert from 'node:assert/strict';
import {
  createListingDraft,
  deleteListingMedia,
  getMyListingMedia,
  getMyListings,
  updateListingStatus,
  uploadListingMedia
} from './listing-api';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const mediaId = '223e4567-e89b-42d3-a456-426614174000';

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

    await getMyListings({
      status: 'draft',
      limit: 10,
      before: '2026-06-22T00:00:00.000Z'
    });
    assert.equal(
      capturedUrl,
      '/api/authed/v1/listings/mine?status=draft&limit=10&before=2026-06-22T00%3A00%3A00.000Z'
    );
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        listing: {
          id: listingId,
          title: 'Test phone',
          status: 'draft',
          created_at: '2026-06-22T00:00:00.000Z'
        }
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await createListingDraft({
      title: 'Test phone',
      description: 'A clear listing description.',
      priceAmount: 100,
      currencyCode: 'AUD',
      condition: 'good',
      countryCode: 'AU',
      allowPickup: true,
      allowDelivery: false
    }, 'human-check');
    assert.equal(capturedUrl, '/api/authed/v1/listings');
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(new Headers(capturedInit?.headers).get('x-suqnaa-human-check'), 'human-check');
    assert.deepEqual(
      JSON.parse(String(capturedInit?.body)),
      {
        title: 'Test phone',
        description: 'A clear listing description.',
        priceAmount: 100,
        currencyCode: 'AUD',
        condition: 'good',
        countryCode: 'AU',
        allowPickup: true,
        allowDelivery: false
      }
    );

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        listing: { id: listingId, title: 'Test phone', status: 'draft' },
        media: [{
          id: mediaId,
          url: `/v1/listings/${listingId}/media/${mediaId}/mine`,
          mimeType: 'image/jpeg',
          width: 1200,
          height: 800,
          sizeBytes: 3,
          sortOrder: 0,
          altText: 'Test phone',
          createdAt: '2026-06-22T00:00:00.000Z'
        }],
        mediaCount: 1
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    const gallery = await getMyListingMedia(listingId);
    assert.equal(
      capturedUrl,
      `/api/authed/v1/listings/${listingId}/media/mine`
    );
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(
      gallery.media[0]?.url,
      `/api/authed/v1/listings/${listingId}/media/${mediaId}/mine`
    );
    assert.equal(gallery.mediaCount, 1);

    const image = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: 'image/jpeg'
    });
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        media: {
          id: mediaId,
          url: `/v1/listings/${listingId}/media/${mediaId}`,
          mimeType: 'image/jpeg',
          width: 1200,
          height: 800,
          sizeBytes: 3,
          sortOrder: 0,
          altText: 'Test phone',
          createdAt: '2026-06-22T00:00:00.000Z'
        },
        mediaCount: 1
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await uploadListingMedia(
      listingId,
      {
        image,
        width: 1200,
        height: 800,
        altText: 'Test phone',
        sortOrder: 0
      },
      'media-upload-check'
    );
    assert.equal(
      capturedUrl,
      `/api/authed/v1/listings/${listingId}/media/upload?width=1200&height=800&altText=Test+phone&sortOrder=0`
    );
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(new Headers(capturedInit?.headers).get('content-type'), 'image/jpeg');
    assert.equal(new Headers(capturedInit?.headers).get('x-suqnaa-human-check'), 'media-upload-check');
    assert.equal(capturedInit?.body, image);

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        listing: {
          id: listingId,
          status: 'active',
          unchanged: false
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await updateListingStatus(listingId, 'active', 'status-check');
    assert.equal(
      capturedUrl,
      `/api/authed/v1/listings/${listingId}/status`
    );
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(new Headers(capturedInit?.headers).get('x-suqnaa-human-check'), 'status-check');
    assert.equal(capturedInit?.body, JSON.stringify({ status: 'active' }));

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        deleted: true,
        mediaId,
        mediaCount: 0
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await deleteListingMedia(listingId, mediaId, 'media-delete-check');
    assert.equal(
      capturedUrl,
      `/api/authed/v1/listings/${listingId}/media/${mediaId}/delete`
    );
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(
      new Headers(capturedInit?.headers).get('x-suqnaa-human-check'),
      'media-delete-check'
    );
    assert.equal(capturedInit?.body, JSON.stringify({}));

    await assert.rejects(
      () => getMyListingMedia('not-a-listing'),
      /UUID/
    );
    assert.throws(
      () => deleteListingMedia(listingId, 'not-media'),
      /UUID/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
