import assert from 'node:assert/strict';
import {
  detectProfileAvatarMime,
  maximumProfileAvatarBytes,
  normalizeProfileAvatarMime,
  profileAvatarObjectKey
} from './avatar.js';

assert.equal(maximumProfileAvatarBytes, 2 * 1024 * 1024);
assert.equal(normalizeProfileAvatarMime('image/jpeg; charset=binary'), 'image/jpeg');
assert.equal(normalizeProfileAvatarMime('application/octet-stream'), null);
assert.equal(detectProfileAvatarMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
assert.equal(detectProfileAvatarMime(Buffer.from('not-an-image')), null);

const key = profileAvatarObjectKey('123e4567-e89b-42d3-a456-426614174000', 'image/webp');
assert.match(key, /^profile-avatars\/123e4567-e89b-42d3-a456-426614174000\/[0-9a-f-]+\.webp$/);

console.log('Profile avatar policy tests passed.');
