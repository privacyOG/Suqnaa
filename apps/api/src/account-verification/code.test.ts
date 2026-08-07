import assert from 'node:assert/strict';
import {
  contactFingerprint,
  generateVerificationCode,
  normalizeVerificationCode,
  verificationCodeHash,
  verificationCodeMatches
} from './code.js';

const pepper = 'verification-test-pepper-that-is-long-enough';

for (let index = 0; index < 100; index += 1) {
  assert.match(generateVerificationCode(), /^\d{6}$/);
}

assert.equal(normalizeVerificationCode(' 123 456 '), '123456');
assert.equal(normalizeVerificationCode('abcdef'), '');
assert.equal(normalizeVerificationCode('12345'), '');

const fingerprint = contactFingerprint(pepper, 'email', 'User@Example.com');
assert.equal(fingerprint.length, 64);
assert.equal(
  fingerprint,
  contactFingerprint(pepper, 'email', 'user@example.com')
);
assert.notEqual(
  fingerprint,
  contactFingerprint(pepper, 'phone', 'user@example.com')
);

const expected = verificationCodeHash({
  pepper,
  verificationId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  channel: 'email',
  code: '123456'
});
const same = verificationCodeHash({
  pepper,
  verificationId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  channel: 'email',
  code: '123456'
});
const different = verificationCodeHash({
  pepper,
  verificationId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  channel: 'email',
  code: '654321'
});

assert.equal(verificationCodeMatches(expected, same), true);
assert.equal(verificationCodeMatches(expected, different), false);
console.log('Account verification code tests passed.');
