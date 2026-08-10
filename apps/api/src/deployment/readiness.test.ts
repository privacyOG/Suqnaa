import assert from 'node:assert/strict';
import { checkDatabaseReadiness } from './readiness.js';

const ready = await checkDatabaseReadiness({
  probe: async () => undefined,
  timeoutMs: 50
});
assert.deepEqual(ready, { ready: true, dependency: 'database' });

const unavailable = await checkDatabaseReadiness({
  probe: async () => {
    throw new Error('database unavailable');
  },
  timeoutMs: 50
});
assert.deepEqual(unavailable, {
  ready: false,
  dependency: 'database',
  reason: 'unavailable'
});

const timedOut = await checkDatabaseReadiness({
  probe: () => new Promise<void>(() => undefined),
  timeoutMs: 5
});
assert.deepEqual(timedOut, {
  ready: false,
  dependency: 'database',
  reason: 'timeout'
});

console.log('Deployment readiness probe passed.');
