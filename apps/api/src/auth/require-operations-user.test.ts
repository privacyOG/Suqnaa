import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { permissionForOperationsRequest } from './require-operations-user.js';

const queueItemId = '123e4567-e89b-42d3-a456-426614174000';

assert.equal(permissionForOperationsRequest('GET', '/v1/operations/health'), 'operations.access');
assert.equal(permissionForOperationsRequest('GET', '/v1/operations/queue?status=open'), 'moderation.queue.read');
assert.equal(
  permissionForOperationsRequest('GET', `/v1/operations/queue/${queueItemId}/conversation-context`),
  'moderation.queue.read'
);
assert.equal(permissionForOperationsRequest('POST', `/v1/operations/queue/${queueItemId}/complete`), 'moderation.queue.resolve');
assert.equal(permissionForOperationsRequest('POST', `/v1/operations/queue/${queueItemId}/listing-status`), 'moderation.listing.manage');
assert.equal(permissionForOperationsRequest('POST', `/v1/operations/queue/${queueItemId}/account-status`), 'moderation.account.manage');
assert.equal(permissionForOperationsRequest('GET', '/v1/operations/records'), 'audit.read');
assert.equal(permissionForOperationsRequest('GET', '/v1/operations/verifications'), 'verification.read');
assert.equal(permissionForOperationsRequest('POST', `/v1/operations/verifications/${queueItemId}/review`), 'verification.review');
assert.equal(permissionForOperationsRequest('GET', '/v1/operations/payments'), 'payments.read');
assert.equal(permissionForOperationsRequest('POST', `/v1/operations/payments/${queueItemId}/request`), 'payments.request');
assert.equal(permissionForOperationsRequest('POST', `/v1/operations/payment-operations/${queueItemId}/decision`), 'payments.approve');
assert.equal(permissionForOperationsRequest('GET', '/v1/operations/settlements?status=failed'), 'settlements.read');
assert.equal(permissionForOperationsRequest('POST', '/v1/operations/settlements/run'), 'settlements.run');
assert.equal(permissionForOperationsRequest('GET', `/v1/operations/queue/${queueItemId}/messages`), null);
assert.equal(permissionForOperationsRequest('POST', '/v1/operations/unknown'), null);

const source = readFileSync(new URL('./require-operations-user.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /OPERATIONS_USER_IDS/);
assert.match(source, /requirePermission\(permission\)/);

console.log('Administrative operations permission mapping tests passed.');
