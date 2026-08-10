import assert from 'node:assert/strict';
import { errorReport } from './error-reporter.js';

const report = errorReport({
  error: new Error('database unavailable'),
  requestId: 'req-123',
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  route: '/orders/:orderId',
  method: 'post'
});

assert.equal(report.requestId, 'req-123');
assert.equal(report.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
assert.equal(report.route, '/orders/:orderId');
assert.equal(report.method, 'POST');
assert.equal(report.errorName, 'Error');
assert.equal(report.message, 'database unavailable');
assert.ok(report.stack?.includes('database unavailable'));
assert.equal('body' in report, false);
assert.equal('headers' in report, false);
assert.equal('ip' in report, false);
assert.equal('userId' in report, false);

const bounded = errorReport({
  error: new Error('x'.repeat(1000)),
  route: 'r'.repeat(500),
  method: 'm'.repeat(30)
});
assert.equal(bounded.message.length, 500);
assert.equal(bounded.route.length, 200);
assert.equal(bounded.method.length, 12);

console.log('error reporting minimization ok');
