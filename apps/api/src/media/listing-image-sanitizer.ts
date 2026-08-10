import type { SupportedListingImageMime } from './listing-media-upload.js';
import type { ListingImageInspection } from './listing-image-safety.js';

export class ListingImageSanitizerError extends Error {
  constructor(
    readonly code: 'orientation_requires_transform' | 'malformed_image',
    message: string
  ) {
    super(message);
  }
}

export type SanitizedListingImage = {
  buffer: Buffer;
  metadataStripped: boolean;
};

function requireNormalizedOrientation(inspection: ListingImageInspection): void {
  if (inspection.orientation !== null && inspection.orientation !== 1) {
    throw new ListingImageSanitizerError(
      'orientation_requires_transform',
      'Image orientation must be normalized before metadata can be removed'
    );
  }
}

function sanitizeJpeg(buffer: Buffer): SanitizedListingImage {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new ListingImageSanitizerError('malformed_image', 'JPEG header is malformed');
  }

  const parts: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  let metadataStripped = false;

  while (offset < buffer.length) {
    const markerStart = offset;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];

    if (marker === 0xd9) {
      parts.push(buffer.subarray(markerStart));
      return { buffer: Buffer.concat(parts), metadataStripped };
    }
    if (marker === 0xda) {
      parts.push(buffer.subarray(markerStart));
      return { buffer: Buffer.concat(parts), metadataStripped };
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buffer.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > buffer.length) {
      throw new ListingImageSanitizerError('malformed_image', 'JPEG segment is truncated');
    }
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new ListingImageSanitizerError('malformed_image', 'JPEG segment length is invalid');
    }
    const segmentEnd = offset + segmentLength;
    const strip = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (strip) metadataStripped = true;
    else parts.push(buffer.subarray(markerStart, segmentEnd));
    offset = segmentEnd;
  }

  throw new ListingImageSanitizerError('malformed_image', 'JPEG image data is incomplete');
}

function sanitizePng(buffer: Buffer): SanitizedListingImage {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    throw new ListingImageSanitizerError('malformed_image', 'PNG header is malformed');
  }

  const parts: Buffer[] = [buffer.subarray(0, 8)];
  const metadataChunks = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'iCCP', 'tIME']);
  let offset = 8;
  let metadataStripped = false;
  let sawIend = false;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const next = offset + 12 + length;
    if (next > buffer.length) {
      throw new ListingImageSanitizerError('malformed_image', 'PNG chunk is truncated');
    }
    if (metadataChunks.has(type)) metadataStripped = true;
    else parts.push(buffer.subarray(offset, next));
    offset = next;
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) {
    throw new ListingImageSanitizerError('malformed_image', 'PNG image data is incomplete');
  }
  return { buffer: Buffer.concat(parts), metadataStripped };
}

function sanitizeWebp(buffer: Buffer): SanitizedListingImage {
  if (
    buffer.length < 20 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new ListingImageSanitizerError('malformed_image', 'WebP header is malformed');
  }

  const chunks: Buffer[] = [];
  const metadataChunks = new Set(['EXIF', 'XMP ', 'ICCP']);
  let offset = 12;
  let metadataStripped = false;

  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const paddedLength = length + (length % 2);
    const end = offset + 8 + paddedLength;
    if (end > buffer.length) {
      throw new ListingImageSanitizerError('malformed_image', 'WebP chunk is truncated');
    }

    if (metadataChunks.has(type)) {
      metadataStripped = true;
    } else if (type === 'VP8X' && length >= 10) {
      const chunk = Buffer.from(buffer.subarray(offset, end));
      // Clear ICC (bit 5), EXIF (bit 3), and XMP (bit 2) feature flags.
      chunk[8] &= ~(0x20 | 0x08 | 0x04);
      chunks.push(chunk);
    } else {
      chunks.push(buffer.subarray(offset, end));
    }
    offset = end;
  }

  if (chunks.length === 0) {
    throw new ListingImageSanitizerError('malformed_image', 'WebP image data is incomplete');
  }

  const payload = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return { buffer: Buffer.concat([header, payload]), metadataStripped };
}

export function sanitizeListingImage(
  buffer: Buffer,
  mimeType: SupportedListingImageMime,
  inspection: ListingImageInspection
): SanitizedListingImage {
  requireNormalizedOrientation(inspection);
  if (mimeType === 'image/jpeg') return sanitizeJpeg(buffer);
  if (mimeType === 'image/png') return sanitizePng(buffer);
  return sanitizeWebp(buffer);
}
