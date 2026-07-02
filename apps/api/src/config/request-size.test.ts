import assert from 'node:assert/strict';
import { resolveApiErrorResponse } from './http-error.js';
import { resolveApiRequestSizeBytes } from './request-size.js';

assert.equal(resolveApiRequestSizeBytes({}), 7340032);
assert.equal(resolveApiRequestSizeBytes({ value: '1048576' }), 1048576);
assert.equal(resolveApiRequestSizeBytes({ value: '8388608' }), 8388608);
assert.throws(() => resolveApiRequestSizeBytes({ value: '1048575' }), /1048576/);
assert.throws(() => resolveApiRequestSizeBytes({ value: '8388609' }), /8388608/);
assert.throws(() => resolveApiRequestSizeBytes({ value: 'invalid' }), /integer/);

assert.equal(resolveApiErrorResponse({ name: 'ZodError' })?.statusCode, 400);
assert.equal(resolveApiErrorResponse({ statusCode: 413 })?.statusCode, 413);
assert.equal(resolveApiErrorResponse({ statusCode: 500 }), null);
