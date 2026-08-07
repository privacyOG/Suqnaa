import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProtectedRoute } from './protected-route-policy';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const form = readFileSync(new URL('../components/edit-listing-form.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/[locale]/sell/manage/[listingId]/edit/page.tsx', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../components/my-listings-panel.tsx', import.meta.url), 'utf8');

assert.deepEqual(
  resolveProtectedRoute('GET', ['v1', 'listings', listingId, 'manage'], new URLSearchParams()),
  { method: 'GET', path: `/v1/listings/${listingId}/manage`, query: '' }
);
assert.deepEqual(
  resolveProtectedRoute('POST', ['v1', 'listings', listingId, 'edit'], new URLSearchParams()),
  { method: 'POST', path: `/v1/listings/${listingId}/edit`, query: '' }
);
assert.equal(
  resolveProtectedRoute('GET', ['v1', 'listings', 'not-a-uuid', 'manage'], new URLSearchParams()),
  null
);
assert.equal(
  resolveProtectedRoute('POST', ['v1', 'listings', listingId, 'edit'], new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')),
  null
);

for (const field of [
  'categoryId',
  'title',
  'description',
  'priceAmount',
  'currencyCode',
  'condition',
  'availabilityStatus',
  'availableQuantity',
  'unitLabel',
  'countryCode',
  'region',
  'city',
  'suburb',
  'allowPickup',
  'allowDelivery'
]) {
  assert.match(form, new RegExp(field));
}
assert.match(form, /version: listing\.version/);
assert.match(form, /actions\.listingEdit/);
assert.match(form, /status === 409/);
assert.match(form, /Reload latest version/);
assert.match(form, /\['draft', 'active', 'expired'\]/);
assert.match(page, /EditListingForm/);
assert.match(manager, /sell\/manage\/\$\{listing\.id\}\/edit/);
assert.match(manager, /editableStatuses/);

console.log('Seller listing edit web surface tests passed.');
