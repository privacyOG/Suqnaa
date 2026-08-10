import './runtime-surface.test.js';
import assert from 'node:assert/strict';
import {
  TraceReporterConfigurationError,
  resolveTraceReporterConfig
} from './trace-reporter.js';

assert.equal(resolveTraceReporterConfig({ nodeEnv: 'production' }), null);
assert.throws(
  () => resolveTraceReporterConfig({ nodeEnv: 'production', endpoint: 'http://traces.internal' }),
  (error: unknown) => error instanceof TraceReporterConfigurationError
);
const config = resolveTraceReporterConfig({
  nodeEnv: 'production',
  endpoint: 'https://traces.example.test/v1/spans',
  token: 'trace-token',
  timeoutMs: '2500'
});
assert.equal(config?.endpoint, 'https://traces.example.test/v1/spans');
assert.equal(config?.token, 'trace-token');
assert.equal(config?.timeoutMs, 2500);

console.log('trace reporter configuration ok');
