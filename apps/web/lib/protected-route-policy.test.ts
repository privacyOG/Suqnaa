import assert from 'node:assert/strict';
import { resolveProtectedRoute } from './protected-route-policy';

const account = resolveProtectedRoute(
  'GET',
  ['v1', 'account', 'me'],
  new URLSearchParams()
);
assert.deepEqual(account, {
  method: 'GET',
  path: '/v1/account/me',
  query: ''
});

const conversations = resolveProtectedRoute(
  'GET',
  ['v1', 'conversations'],
  new URLSearchParams('limit=20&before=2026-06-22T00%3A00%3A00.000Z')
);
assert.equal(conversations?.path, '/v1/conversations');
assert.equal(
  conversations?.query,
  'limit=20&before=2026-06-22T00%3A00%3A00.000Z'
);

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const mediaId = '223e4567-e89b-42d3-a456-426614174000';
assert.ok(resolveProtectedRoute(
  'GET',
  ['v1', 'conversations', conversationId, 'messages'],
  new URLSearchParams('limit=50')
));
assert.ok(resolveProtectedRoute(
  'POST',
  ['v1', 'conversations', conversationId, 'read'],
  new URLSearchParams()
));
assert.ok(resolveProtectedRoute(
  'POST',
  ['v1', 'listings', conversationId, 'status'],
  new URLSearchParams()
));

const mediaUpload = resolveProtectedRoute(
  'POST',
  ['v1', 'listings', conversationId, 'media', 'upload'],
  new URLSearchParams('width=1200&height=800&altText=Test+phone&sortOrder=0')
);
assert.equal(mediaUpload?.path, `/v1/listings/${conversationId}/media/upload`);
assert.equal(
  mediaUpload?.query,
  'width=1200&height=800&altText=Test+phone&sortOrder=0'
);
assert.equal(resolveProtectedRoute(
  'POST',
  ['v1', 'listings', conversationId, 'media'],
  new URLSearchParams()
), null);
assert.ok(resolveProtectedRoute(
  'POST',
  ['v1', 'listings', conversationId, 'media', mediaId, 'delete'],
  new URLSearchParams()
));

const queue = resolveProtectedRoute(
  'GET',
  ['v1', 'operations', 'queue'],
  new URLSearchParams('status=open&limit=25&before=2026-06-22T00%3A00%3A00.000Z')
);
assert.equal(queue?.path, '/v1/operations/queue');
assert.equal(
  queue?.query,
  'status=open&limit=25&before=2026-06-22T00%3A00%3A00.000Z'
);

const records = resolveProtectedRoute(
  'GET',
  ['v1', 'operations', 'records'],
  new URLSearchParams('limit=25&action=operations.queue.complete&entityType=report')
);
assert.equal(records?.path, '/v1/operations/records');
assert.equal(
  records?.query,
  'limit=25&action=operations.queue.complete&entityType=report'
);

assert.ok(resolveProtectedRoute(
  'POST',
  ['v1', 'operations', 'queue', conversationId, 'complete'],
  new URLSearchParams()
));
assert.ok(resolveProtectedRoute(
  'POST',
  ['v1', 'operations', 'queue', conversationId, 'listing-status'],
  new URLSearchParams()
));
assert.ok(resolveProtectedRoute(
  'POST',
  ['v1', 'operations', 'queue', conversationId, 'account-status'],
  new URLSearchParams()
));

assert.equal(resolveProtectedRoute(
  'DELETE',
  ['v1', 'listings', conversationId],
  new URLSearchParams()
), null);
assert.equal(resolveProtectedRoute(
  'GET',
  ['v1', '..', 'account', 'me'],
  new URLSearchParams()
), null);
assert.equal(resolveProtectedRoute(
  'GET',
  ['v1', 'account', 'me'],
  new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')
), null);
assert.equal(resolveProtectedRoute(
  'GET',
  ['v1', 'conversations'],
  new URLSearchParams('limit=20&limit=30')
), null);
assert.equal(resolveProtectedRoute(
  'GET',
  ['v1', 'operations', 'records'],
  new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')
), null);
assert.equal(resolveProtectedRoute(
  'POST',
  ['v1', 'listings', conversationId, 'media', 'upload'],
  new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')
), null);
assert.equal(resolveProtectedRoute(
  'POST',
  ['v1', 'operations', 'queue', 'not-a-uuid', 'complete'],
  new URLSearchParams()
), null);
assert.equal(resolveProtectedRoute(
  'POST',
  ['v1', 'auth', 'refresh'],
  new URLSearchParams()
), null);
assert.equal(resolveProtectedRoute(
  'POST',
  ['v1', 'market', 'unknown'],
  new URLSearchParams()
), null);
