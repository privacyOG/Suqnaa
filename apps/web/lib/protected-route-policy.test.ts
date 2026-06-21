import assert from 'node:assert/strict';
import { resolveProtectedRoute } from './protected-route-policy.js';

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
  'POST',
  ['v1', 'auth', 'refresh'],
  new URLSearchParams()
), null);
assert.equal(resolveProtectedRoute(
  'POST',
  ['v1', 'market', 'unknown'],
  new URLSearchParams()
), null);
