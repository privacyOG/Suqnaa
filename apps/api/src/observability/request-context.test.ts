import assert from 'node:assert/strict';
import {
  resolveRequestId,
  resolveTraceId,
  safeRouteLabel,
  statusClass
} from './request-context.js';

assert.equal(resolveRequestId('client-123'), 'client-123');
assert.notEqual(resolveRequestId('bad id with spaces'), 'bad id with spaces');
assert.equal(resolveRequestId('x'.repeat(65)).length, 36);

assert.equal(
  resolveTraceId('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'),
  '4bf92f3577b34da6a3ce929d0e0e4736'
);
assert.equal(resolveTraceId('00-00000000000000000000000000000000-00f067aa0ba902b7-01'), null);
assert.equal(resolveTraceId('not-a-traceparent'), null);

assert.equal(safeRouteLabel('/listings/:listingId'), '/listings/:listingId');
assert.equal(safeRouteLabel('x'.repeat(201)), 'unknown');
assert.equal(statusClass(201), '2xx');
assert.equal(statusClass(503), '5xx');
assert.equal(statusClass(99), 'unknown');

console.log('request context normalization ok');
