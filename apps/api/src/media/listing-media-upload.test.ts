import assert from 'node:assert/strict';
import {
  detectListingImageMime,
  extensionForListingImage,
  maximumListingImageBytes,
  normalizeListingImageMime
} from './listing-media-upload.js';

assert.equal(maximumListingImageBytes, 4 * 1024 * 1024);
assert.equal(normalizeListingImageMime('image/jpeg'), 'image/jpeg');
assert.equal(normalizeListingImageMime('image/png; charset=binary'), 'image/png');
assert.equal(normalizeListingImageMime(['image/webp']), 'image/webp');
assert.equal(normalizeListingImageMime('application/octet-stream'), null);
assert.equal(normalizeListingImageMime(undefined), null);

assert.equal(
  detectListingImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])),
  'image/jpeg'
);
assert.equal(
  detectListingImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/png'
);
assert.equal(
  detectListingImageMime(Buffer.from('RIFF0000WEBP', 'ascii')),
  'image/webp'
);
assert.equal(detectListingImageMime(Buffer.from('not-an-image')), null);

assert.equal(extensionForListingImage('image/jpeg'), 'jpg');
assert.equal(extensionForListingImage('image/png'), 'png');
assert.equal(extensionForListingImage('image/webp'), 'webp');
