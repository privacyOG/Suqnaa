import assert from 'node:assert/strict';
import { protectedAccountStatusAllowed } from './require-user.js';

assert.equal(protectedAccountStatusAllowed('active'), true);
assert.equal(protectedAccountStatusAllowed('pending'), true);
assert.equal(protectedAccountStatusAllowed('closed'), false);
assert.equal(protectedAccountStatusAllowed('suspended'), false);
assert.equal(protectedAccountStatusAllowed(null), true);

console.log('Protected account status tests passed.');
