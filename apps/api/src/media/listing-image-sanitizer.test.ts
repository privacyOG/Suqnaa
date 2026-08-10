import assert from 'node:assert/strict';
import { inspectListingImage } from './listing-image-safety.js';
import {
  ListingImageSanitizerError,
  sanitizeListingImage
} from './listing-image-sanitizer.js';

function png(width: number, height: number, extraChunks: Array<{ type: string; data?: Buffer }> = []): Buffer {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const chunk = (type: string, data = Buffer.alloc(0)) => {
    const result = Buffer.alloc(12 + data.length);
    result.writeUInt32BE(data.length, 0);
    result.write(type, 4, 4, 'ascii');
    data.copy(result, 8);
    return result;
  };
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    ...extraChunks.map(({ type, data }) => chunk(type, data)),
    chunk('IEND')
  ]);
}

function jpeg(width: number, height: number, orientation = 1): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 2, 'ascii');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app = Buffer.alloc(payload.length + 4);
  app[0] = 0xff;
  app[1] = 0xe1;
  app.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app, 4);

  const sof = Buffer.alloc(13);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(11, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 1;
  sof[10] = 1;
  sof[11] = 0x11;
  sof[12] = 0;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app, sof, Buffer.from([0xff, 0xd9])]);
}

function webpWithMetadata(width: number, height: number): Buffer {
  const vp8x = Buffer.alloc(18);
  vp8x.write('VP8X', 0, 4, 'ascii');
  vp8x.writeUInt32LE(10, 4);
  vp8x[8] = 0x2c;
  vp8x.writeUIntLE(width - 1, 12, 3);
  vp8x.writeUIntLE(height - 1, 15, 3);
  const xmpData = Buffer.from('secret');
  const xmp = Buffer.alloc(8 + xmpData.length + (xmpData.length % 2));
  xmp.write('XMP ', 0, 4, 'ascii');
  xmp.writeUInt32LE(xmpData.length, 4);
  xmpData.copy(xmp, 8);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 4, 'ascii');
  riff.writeUInt32LE(vp8x.length + xmp.length + 4, 4);
  riff.write('WEBP', 8, 4, 'ascii');
  return Buffer.concat([riff, vp8x, xmp]);
}

{
  const original = png(640, 480, [
    { type: 'tEXt', data: Buffer.from('author\0private') },
    { type: 'iTXt', data: Buffer.from('location') }
  ]);
  const inspection = inspectListingImage(original, 'image/png');
  const sanitized = sanitizeListingImage(original, 'image/png', inspection);
  assert.equal(sanitized.metadataStripped, true);
  assert.equal(sanitized.buffer.includes(Buffer.from('private')), false);
  assert.equal(inspectListingImage(sanitized.buffer, 'image/png').containsMetadata, false);
}

{
  const original = jpeg(1920, 1080, 1);
  const inspection = inspectListingImage(original, 'image/jpeg');
  const sanitized = sanitizeListingImage(original, 'image/jpeg', inspection);
  assert.equal(sanitized.metadataStripped, true);
  assert.equal(sanitized.buffer.includes(Buffer.from('Exif\0\0', 'binary')), false);
  assert.equal(inspectListingImage(sanitized.buffer, 'image/jpeg').containsMetadata, false);
}

{
  const original = webpWithMetadata(1280, 720);
  const inspection = inspectListingImage(original, 'image/webp');
  const sanitized = sanitizeListingImage(original, 'image/webp', inspection);
  assert.equal(sanitized.metadataStripped, true);
  assert.equal(sanitized.buffer.includes(Buffer.from('XMP ', 'ascii')), false);
  assert.equal((sanitized.buffer[20] & 0x2c), 0);
}

{
  const original = jpeg(800, 600, 6);
  const inspection = inspectListingImage(original, 'image/jpeg');
  assert.throws(
    () => sanitizeListingImage(original, 'image/jpeg', inspection),
    (error: unknown) =>
      error instanceof ListingImageSanitizerError &&
      error.code === 'orientation_requires_transform'
  );
}

console.log('listing image sanitizer ok');
