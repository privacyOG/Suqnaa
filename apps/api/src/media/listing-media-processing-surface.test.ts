import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const upload = await readFile(new URL('../routes/listing-media-upload.ts', import.meta.url), 'utf8');
const media = await readFile(new URL('../routes/listing-media.ts', import.meta.url), 'utf8');
const thumbnail = await readFile(new URL('../routes/listing-media-thumbnail.ts', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(upload, /mediaReviewInput\(buffer, detectedMimeType\)/);
assert.match(upload, /transformListingImage\(/);
assert.match(upload, /persistReadyListingMedia\(/);
assert.match(upload, /persistQuarantinedListingMedia\(/);
assert.match(upload, /thumbnailUrl:/);
assert.doesNotMatch(upload, /orientation_requires_transform/);

assert.match(media, /listing_media_derivatives/);
assert.match(media, /Promise\.all\(objectKeys\.map/);
assert.match(media, /removedObjectCount/);

assert.match(thumbnail, /listing_media_derivatives/);
assert.match(thumbnail, /kind', '=', 'thumbnail'/);
assert.match(thumbnail, /listings\.status', '=', 'active'/);
assert.match(thumbnail, /users\.status as seller_status/);
assert.match(server, /listingMediaThumbnailRoutes/);

console.log('listing media processing surface ok');
