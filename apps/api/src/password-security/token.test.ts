import assert from 'node:assert/strict';
import {
  newPasswordResetToken,
  normalizePasswordResetToken,
  passwordResetTargetFingerprint,
  passwordResetTokenHash
} from './token.js';

const pepper = 'password-reset-test-pepper-at-least-32-characters';
const first = newPasswordResetToken();
const second = newPasswordResetToken();

assert.match(first, /^[A-Za-z0-9_-]{43}$/);
assert.notEqual(first, second);
assert.equal(normalizePasswordResetToken(`  ${first}  `), first);
assert.throws(() => normalizePasswordResetToken('too-short'));
assert.equal(passwordResetTokenHash(pepper, first).length, 64);
assert.notEqual(passwordResetTokenHash(pepper, first), passwordResetTokenHash(pepper, second));
assert.equal(
  passwordResetTargetFingerprint(pepper, ' Person@Example.com '),
  passwordResetTargetFingerprint(pepper, 'person@example.com')
);

console.log('Password reset token tests passed.');
