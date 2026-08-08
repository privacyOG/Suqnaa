import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveProtectedRoute } from './protected-route-policy';

async function run() {
  const api = await readFile(new URL('./notification-api.ts', import.meta.url), 'utf8');
  const centre = await readFile(new URL('../components/notification-centre.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../app/[locale]/notifications/page.tsx', import.meta.url), 'utf8');
  const account = await readFile(new URL('../app/[locale]/account/page.tsx', import.meta.url), 'utf8');

  assert.match(api, /getMarketplaceNotifications/);
  assert.match(api, /updateMarketplaceNotificationPreference/);
  assert.match(centre, /markAllMarketplaceNotificationsRead/);
  assert.match(centre, /smsEnabled/);
  assert.match(centre, /المحادثات المكتومة/);
  assert.match(page, /NotificationCentre/);
  assert.match(page, /loadAccountSessionState/);
  assert.match(account, /\/notifications/);

  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(
    resolveProtectedRoute(
      'GET',
      ['v1', 'notifications'],
      new URLSearchParams('limit=50&unreadOnly=true')
    )?.query,
    'limit=50&unreadOnly=true'
  );
  assert.equal(
    resolveProtectedRoute('GET', ['v1', 'notifications', 'preferences'], new URLSearchParams())?.path,
    '/v1/notifications/preferences'
  );
  assert.equal(
    resolveProtectedRoute('POST', ['v1', 'notifications', uuid, 'read'], new URLSearchParams())?.path,
    `/v1/notifications/${uuid}/read`
  );
  assert.equal(
    resolveProtectedRoute('POST', ['v1', 'notifications', 'read-all'], new URLSearchParams())?.path,
    '/v1/notifications/read-all'
  );
  assert.equal(
    resolveProtectedRoute('GET', ['v1', 'notifications'], new URLSearchParams('unexpected=true')),
    null
  );
}

void run();
