import assert from 'node:assert/strict';
import { isPhoneE164, normalizePhoneE164, PhoneNormalizationError } from './phone.js';

assert.equal(normalizePhoneE164('+61 412 345 678'), '+61412345678');
assert.equal(normalizePhoneE164('0061 (412) 345-678'), '+61412345678');
assert.equal(normalizePhoneE164('+٦١ ٤١٢ ٣٤٥ ٦٧٨'), '+61412345678');
assert.equal(normalizePhoneE164('+۶۱ ۴۱۲ ۳۴۵ ۶۷۸'), '+61412345678');
assert.equal(isPhoneE164('+61412345678'), true);
assert.equal(isPhoneE164('+0123456789'), false);

for (const invalid of [
  '0412345678',
  '61 412 345 678',
  '+61 412 ext 4',
  '+1234567',
  '+1234567890123456'
]) {
  assert.throws(() => normalizePhoneE164(invalid), PhoneNormalizationError);
}

console.log('Phone identity normalization tests passed.');
