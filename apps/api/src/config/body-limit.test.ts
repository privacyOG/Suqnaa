import assert from 'node:assert/strict';
import { resolveApiBodyLimitBytes } from './body-limit.js';

assert.equal(
  resolveApiBodyLimitBytes({}),
  7 * 1024 * 1024
);

assert.equal(
  resolveApiBodyLimitBytes({ value: '1048576' }),
  1048576
);

assert.equal(
  resolveApiBodyLimitBytes({ value: '8388608' }),
  8388608
);

assert.throws(
  () => resolveApiBodyLimitBytes({ value: '1048575' }),
  /at least/
);

assert.throws(
  () => resolveApiBodyLimitBytes({ value: '8388609' }),
  /not exceed/
);

assert.throws(
  () => resolveApiBodyLimitBytes({ value: 'invalid' }),
  /integer/
);
