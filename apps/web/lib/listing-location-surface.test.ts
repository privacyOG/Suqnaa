import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProtectedRoute } from './protected-route-policy';

const client = readFileSync(new URL('./listing-location-api.ts', import.meta.url), 'utf8');
const component = readFileSync(
  new URL('../components/listing-location-form.tsx', import.meta.url),
  'utf8'
);
const page = readFileSync(
  new URL('../app/[locale]/sell/manage/[listingId]/edit/page.tsx', import.meta.url),
  'utf8'
);

const id = '123e4567-e89b-42d3-a456-426614174000';
assert.deepEqual(
  resolveProtectedRoute('GET', ['v1', 'listings', id, 'location', 'manage'], new URLSearchParams()),
  { method: 'GET', path: `/v1/listings/${id}/location/manage`, query: '' }
);
assert.deepEqual(
  resolveProtectedRoute('POST', ['v1', 'listings', id, 'location'], new URLSearchParams()),
  { method: 'POST', path: `/v1/listings/${id}/location`, query: '' }
);
assert.equal(
  resolveProtectedRoute('GET', ['v1', 'listings', id, 'location'], new URLSearchParams()),
  null
);
assert.equal(
  resolveProtectedRoute('POST', ['v1', 'listings', id, 'location', 'manage'], new URLSearchParams()),
  null
);

assert.match(client, /location\/manage/);
assert.match(client, /approximateLocation: ApproximateLocation \| null/);
assert.match(client, /challengeResponse/);
assert.match(component, /configuration\?\.actions\.listingEdit/);
assert.match(component, /step="0\.01"/);
assert.match(component, /rounded to a 0\.01° grid/);
assert.match(component, /never published/);
assert.match(component, /Leave both fields blank to remove/);
assert.match(component, /status === 409/);
assert.match(page, /ListingLocationForm/);

console.log('Web listing location privacy surface tests passed.');
