import assert from 'node:assert/strict';
import { apiLoggerOptions, resolveLogLevel } from './logger-config.js';

assert.equal(resolveLogLevel(undefined), 'info');
assert.equal(resolveLogLevel('DEBUG'), 'debug');
assert.equal(resolveLogLevel('garbage'), 'info');
assert.equal(apiLoggerOptions({ nodeEnv: 'test' }), false);
const options = apiLoggerOptions({ nodeEnv: 'production', logLevel: 'warn' });
assert.notEqual(options, false);
if (options !== false) {
  assert.equal(options.level, 'warn');
  assert.ok(options.redact.paths.includes('req.headers.authorization'));
  assert.ok(options.redact.paths.includes('*.email'));
  assert.equal(options.redact.censor, '[REDACTED]');
}

console.log('logger privacy configuration ok');
