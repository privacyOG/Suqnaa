import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveProtectedRoute } from './protected-route-policy';

async function run() {
  const actions = await readFile(new URL('../components/listing-discovery-actions.tsx', import.meta.url), 'utf8');
  const centre = await readFile(new URL('../components/discovery-centre.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../app/[locale]/account/discovery/page.tsx', import.meta.url), 'utf8');
  const detail = await readFile(new URL('../app/[locale]/listings/[listingId]/page.tsx', import.meta.url), 'utf8');
  const account = await readFile(new URL('../app/[locale]/account/page.tsx', import.meta.url), 'utf8');

  assert.match(actions, /recordDiscoveryView/);
  assert.match(actions, /saveDiscoveryListing/);
  assert.match(actions, /watchDiscoveryListing/);
  assert.match(actions, /حفظ الإعلان/);
  assert.match(centre, /createDiscoverySavedSearch/);
  assert.match(centre, /getSavedSearchNotifications/);
  assert.match(centre, /markAllDiscoveryNotificationsRead/);
  assert.match(centre, /قائمة المراقبة/);
  assert.match(page, /DiscoveryCentre/);
  assert.match(page, /loadAccountSessionState/);
  assert.match(detail, /ListingDiscoveryActions/);
  assert.match(account, /account\/discovery/);

  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(resolveProtectedRoute('GET', ['v1', 'discovery', 'listings', uuid, 'state'], new URLSearchParams())?.path, `/v1/discovery/listings/${uuid}/state`);
  assert.equal(resolveProtectedRoute('POST', ['v1', 'discovery', 'saved-listings', uuid, 'save'], new URLSearchParams())?.path, `/v1/discovery/saved-listings/${uuid}/save`);
  assert.equal(resolveProtectedRoute('POST', ['v1', 'discovery', 'watchlist', uuid, 'watch'], new URLSearchParams())?.path, `/v1/discovery/watchlist/${uuid}/watch`);
  assert.equal(resolveProtectedRoute('POST', ['v1', 'discovery', 'recently-viewed', uuid, 'view'], new URLSearchParams())?.path, `/v1/discovery/recently-viewed/${uuid}/view`);
  assert.equal(resolveProtectedRoute('GET', ['v1', 'discovery', 'notifications'], new URLSearchParams('limit=50&unreadOnly=true'))?.query, 'limit=50&unreadOnly=true');
  assert.equal(resolveProtectedRoute('GET', ['v1', 'discovery', 'notifications'], new URLSearchParams('unexpected=true')), null);
  assert.equal(resolveProtectedRoute('POST', ['v1', 'discovery', 'saved-listings', 'not-a-listing', 'save'], new URLSearchParams()), null);
}

void run();
