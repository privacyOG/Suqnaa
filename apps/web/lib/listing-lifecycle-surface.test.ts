import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveProtectedRoute } from './protected-route-policy';

async function run() {
  const panel = await readFile(new URL('../components/listing-lifecycle-panel.tsx', import.meta.url), 'utf8');
  const page = await readFile(
    new URL('../app/[locale]/sell/manage/[listingId]/lifecycle/page.tsx', import.meta.url),
    'utf8'
  );
  const editPage = await readFile(
    new URL('../app/[locale]/sell/manage/[listingId]/edit/page.tsx', import.meta.url),
    'utf8'
  );

  assert.match(panel, /getListingLifecycle/);
  assert.match(panel, /renewListingLifecycle/);
  assert.match(panel, /listing\.version/);
  assert.match(panel, /renewable/);
  assert.match(panel, /Reactivate listing/);
  assert.match(panel, /Renew listing/);
  assert.match(panel, /تجديد الإعلان/);
  assert.match(panel, /إعادة تنشيط/);
  assert.match(panel, /Reload status/);
  assert.match(panel, /status === 409/);
  assert.match(page, /ListingLifecyclePanel/);
  assert.match(page, /loadAccountSessionState/);
  assert.match(page, /SessionRefresh/);
  assert.match(page, /Expiry, renewal and inventory/);
  assert.match(editPage, /\/lifecycle/);

  const lifecycleGet = resolveProtectedRoute(
    'GET',
    ['v1', 'listings', '123e4567-e89b-42d3-a456-426614174000', 'lifecycle'],
    new URLSearchParams()
  );
  assert.equal(lifecycleGet?.path, '/v1/listings/123e4567-e89b-42d3-a456-426614174000/lifecycle');

  const lifecyclePost = resolveProtectedRoute(
    'POST',
    ['v1', 'listings', '123e4567-e89b-42d3-a456-426614174000', 'renew'],
    new URLSearchParams()
  );
  assert.equal(lifecyclePost?.path, '/v1/listings/123e4567-e89b-42d3-a456-426614174000/renew');

  assert.equal(
    resolveProtectedRoute(
      'POST',
      ['v1', 'listings', '123e4567-e89b-42d3-a456-426614174000', 'renew'],
      new URLSearchParams('force=true')
    ),
    null
  );
  assert.equal(
    resolveProtectedRoute(
      'POST',
      ['v1', 'listings', 'not-a-listing', 'renew'],
      new URLSearchParams()
    ),
    null
  );

  console.log('Web listing lifecycle surface tests passed.');
}

void run();
