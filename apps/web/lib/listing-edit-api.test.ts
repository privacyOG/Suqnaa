import assert from 'node:assert/strict';
import {
  getSellerListingForEdit,
  updateSellerListingDetails,
  type ListingEditInput
} from './listing-api';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const categoryId = '223e4567-e89b-42d3-a456-426614174000';

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
          categoryId,
          title: 'Editable listing',
          description: 'A listing that can be edited safely.',
          priceAmount: '100.00',
          currencyCode: 'AUD',
          condition: 'good',
          availabilityStatus: 'in_stock',
          availableQuantity: 2,
          unitLabel: 'items',
          status: 'draft',
          countryCode: 'AU',
          region: 'NSW',
          city: 'Sydney',
          suburb: 'Greenacre',
          allowPickup: true,
          allowDelivery: false,
          version: 7,
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z'
        },
        editable: true
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const snapshot = await getSellerListingForEdit(listingId);
    assert.equal(capturedUrl, `/api/authed/v1/listings/${listingId}/manage`);
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(snapshot.listing.version, 7);
    assert.equal(snapshot.editable, true);

    const edit: ListingEditInput = {
      version: 7,
      categoryId,
      title: 'Updated listing',
      description: 'Updated description retaining every seller editable field.',
      priceAmount: 120.5,
      currencyCode: 'AUD',
      condition: 'like_new',
      availabilityStatus: 'limited',
      availableQuantity: 1,
      unitLabel: 'item',
      countryCode: 'AU',
      region: 'NSW',
      city: 'Sydney',
      suburb: 'Bankstown',
      allowPickup: true,
      allowDelivery: true
    };

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        listing: { ...edit, id: listingId, status: 'draft', version: 8 },
        unchanged: false
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const saved = await updateSellerListingDetails(listingId, edit, 'edit-human-check');
    assert.equal(capturedUrl, `/api/authed/v1/listings/${listingId}/edit`);
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(new Headers(capturedInit?.headers).get('x-suqnaa-human-check'), 'edit-human-check');
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), edit);
    assert.equal(saved.listing.version, 8);

    assert.throws(() => getSellerListingForEdit('not-a-listing'), /UUID/);
    assert.throws(
      () => updateSellerListingDetails('not-a-listing', edit),
      /UUID/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
