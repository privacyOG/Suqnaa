import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MetricsAccessConfigurationError,
  loadMetricsAccessToken,
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

const directory = mkdtempSync(join(tmpdir(), 'suqnaa-metrics-'));
try {
  const tokenFile = join(directory, 'token');
  writeFileSync(tokenFile, `${token}\n`, 'utf8');
  assert.equal(
    loadMetricsAccessToken({ nodeEnv: 'production', token: 'wrong', tokenFile }),
    token
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('metrics access policy ok');
