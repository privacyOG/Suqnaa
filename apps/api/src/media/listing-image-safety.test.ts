import assert from 'node:assert/strict';
import {
  ListingImageSafetyError,
  inspectListingImage,
  maximumListingImagePixels
} from './listing-image-safety.js';

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

function jpeg(width: number, height: number, withExif = false): Buffer {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (withExif) {
    const payload = Buffer.from('Exif\0\0MM\0*\0\0\0\b\0\0\0\0\0\0', 'binary');
    const app = Buffer.alloc(payload.length + 4);
    app[0] = 0xff;
    app[1] = 0xe1;
    app.writeUInt16BE(payload.length + 2, 2);
    payload.copy(app, 4);
    parts.push(app);
  }
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
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function webpVp8x(width: number, height: number): Buffer {
  const chunk = Buffer.alloc(18);
  chunk.write('VP8X', 0, 4, 'ascii');
  chunk.writeUInt32LE(10, 4);
  chunk.writeUIntLE(width - 1, 12, 3);
  chunk.writeUIntLE(height - 1, 15, 3);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 4, 'ascii');
  riff.writeUInt32LE(chunk.length + 4, 4);
  riff.write('WEBP', 8, 4, 'ascii');
  return Buffer.concat([riff, chunk]);
}

{
  const result = inspectListingImage(png(2400, 1600), 'image/png');
  assert.equal(result.width, 2400);
  assert.equal(result.height, 1600);
  assert.equal(result.pixels, 3_840_000);
  assert.equal(result.containsMetadata, false);
}

{
  const result = inspectListingImage(png(800, 600, [{ type: 'tEXt', data: Buffer.from('author\0secret') }]), 'image/png');
  assert.equal(result.containsMetadata, true);
}

{
  const result = inspectListingImage(jpeg(1920, 1080, true), 'image/jpeg');
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.containsMetadata, true);
}

{
  const result = inspectListingImage(webpVp8x(1280, 720), 'image/webp');
  assert.equal(result.width, 1280);
  assert.equal(result.height, 720);
}

assert.throws(
  () => inspectListingImage(png(10_000, Math.floor(maximumListingImagePixels / 10_000) + 1), 'image/png'),
  (error: unknown) => error instanceof ListingImageSafetyError && error.code === 'pixel_limit_exceeded'
);

assert.throws(
  () => inspectListingImage(Buffer.from('89504e470d0a1a0a', 'hex'), 'image/png'),
  (error: unknown) => error instanceof ListingImageSafetyError && error.code === 'malformed_image'
);

console.log('listing image safety ok');
