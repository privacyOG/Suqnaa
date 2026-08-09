import assert from 'node:assert/strict';
import { resolveProtectedRoute } from './protected-route-policy';

const account = resolveProtectedRoute('GET', ['v1', 'account', 'me'], new URLSearchParams());
assert.deepEqual(account, { method: 'GET', path: '/v1/account/me', query: '' });

for (const segments of [
  ['v1', 'account', 'profile'],
  ['v1', 'account', 'profile', 'avatar'],
  ['v1', 'account', 'export'],
  ['v1', 'account', 'seller-verification']
]) {
  assert.ok(resolveProtectedRoute('GET', segments, new URLSearchParams()));
  assert.equal(resolveProtectedRoute('GET', segments, new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')), null);
}
for (const segments of [
  ['v1', 'account', 'profile'],
  ['v1', 'account', 'profile', 'avatar', 'upload'],
  ['v1', 'account', 'profile', 'avatar', 'delete'],
  ['v1', 'account', 'closure'],
  ['v1', 'account', 'seller-verification', 'start']
]) {
  assert.ok(resolveProtectedRoute('POST', segments, new URLSearchParams()));
  assert.equal(resolveProtectedRoute('POST', segments, new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')), null);
}

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const mediaId = '223e4567-e89b-42d3-a456-426614174000';
assert.ok(resolveProtectedRoute('GET', ['v1', 'conversations'], new URLSearchParams('limit=20')));
assert.ok(resolveProtectedRoute('GET', ['v1', 'conversations', conversationId, 'messages'], new URLSearchParams('limit=50')));
assert.ok(resolveProtectedRoute('POST', ['v1', 'conversations', conversationId, 'read'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'listings', conversationId, 'status'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('GET', ['v1', 'listings', conversationId, 'media', 'mine'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('GET', ['v1', 'listings', conversationId, 'media', mediaId, 'mine'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'listings', conversationId, 'media', 'upload'], new URLSearchParams('width=1200&height=800&sortOrder=0')));
assert.ok(resolveProtectedRoute('POST', ['v1', 'listings', conversationId, 'media', mediaId, 'delete'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'payments', 'protected-checkout'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'market', 'orders', conversationId, 'cancel'], new URLSearchParams()));

assert.ok(resolveProtectedRoute('GET', ['v1', 'operations', 'queue'], new URLSearchParams('status=open&limit=25')));
assert.ok(resolveProtectedRoute('GET', ['v1', 'operations', 'records'], new URLSearchParams('limit=25&entityType=report')));
assert.ok(resolveProtectedRoute('GET', ['v1', 'operations', 'verifications'], new URLSearchParams('status=pending&limit=25')));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'verifications', conversationId, 'review'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'queue', conversationId, 'complete'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'queue', conversationId, 'listing-status'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'queue', conversationId, 'account-status'], new URLSearchParams()));

const paymentDecision = resolveProtectedRoute(
  'POST',
  ['v1', 'operations', 'payment-operations', conversationId, 'decision'],
  new URLSearchParams()
);
assert.deepEqual(paymentDecision, {
  method: 'POST',
  path: `/v1/operations/payment-operations/${conversationId}/decision`,
  query: ''
});
assert.deepEqual(resolveProtectedRoute(
  'POST',
  ['v1', 'operations', 'settlements', 'run'],
  new URLSearchParams()
), {
  method: 'POST',
  path: '/v1/operations/settlements/run',
  query: ''
});
assert.equal(resolveProtectedRoute(
  'POST',
  ['v1', 'operations', 'payment-operations', 'not-a-uuid', 'decision'],
  new URLSearchParams()
), null);
assert.equal(resolveProtectedRoute(
  'POST',
  ['v1', 'operations', 'settlements', 'run'],
  new URLSearchParams('limit=500')
), null);

for (const invalid of [
  resolveProtectedRoute('POST', ['v1', 'market', 'identity-checks'], new URLSearchParams()),
  resolveProtectedRoute('DELETE', ['v1', 'listings', conversationId], new URLSearchParams()),
  resolveProtectedRoute('GET', ['v1', '..', 'account', 'me'], new URLSearchParams()),
  resolveProtectedRoute('POST', ['v1', 'operations', 'queue', 'not-a-uuid', 'complete'], new URLSearchParams()),
  resolveProtectedRoute('POST', ['v1', 'auth', 'refresh'], new URLSearchParams()),
  resolveProtectedRoute('POST', ['v1', 'market', 'unknown'], new URLSearchParams())
]) {
  assert.equal(invalid, null);
}

assert.equal(resolveProtectedRoute('GET', ['v1', 'account', 'me'], new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')), null);
assert.equal(resolveProtectedRoute('GET', ['v1', 'conversations'], new URLSearchParams('limit=20&limit=30')), null);
assert.equal(resolveProtectedRoute('POST', ['v1', 'listings', conversationId, 'media', 'upload'], new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')), null);

console.log('Protected route policy passed.');
