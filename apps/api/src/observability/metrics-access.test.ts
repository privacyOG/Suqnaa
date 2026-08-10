import assert from 'node:assert/strict';
import {
  MetricsAccessConfigurationError,
  metricsAuthorizationAllowed,
  resolveMetricsAccessToken
} from './metrics-access.js';

assert.equal(resolveMetricsAccessToken({ nodeEnv: 'development', token: '' }), null);
assert.equal(resolveMetricsAccessToken({ nodeEnv: 'test', token: 'test-token' }), 'test-token');
assert.throws(
  () => resolveMetricsAccessToken({ nodeEnv: 'production', token: 'short' }),
  (error: unknown) => error instanceof MetricsAccessConfigurationError
);

const token = 'a'.repeat(32);
assert.equal(resolveMetricsAccessToken({ nodeEnv: 'production', token }), token);
assert.equal(metricsAuthorizationAllowed(undefined, null), true);
assert.equal(metricsAuthorizationAllowed(`Bearer ${token}`, token), true);
assert.equal(metricsAuthorizationAllowed('Bearer wrong', token), false);
assert.equal(metricsAuthorizationAllowed(undefined, token), false);

console.log('metrics access policy ok');
