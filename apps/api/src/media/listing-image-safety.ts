import type { SupportedListingImageMime } from './listing-media-upload.js';

export const maximumListingImageDimension = 12_000;
export const maximumListingImagePixels = 40_000_000;

export type ListingImageInspection = {
  width: number;
  height: number;
  pixels: number;
  orientation: number | null;
  containsMetadata: boolean;
};

export class ListingImageSafetyError extends Error {
  constructor(
    readonly code: 'malformed_image' | 'invalid_dimensions' | 'pixel_limit_exceeded',
    message: string
  ) {
    super(message);
  }
}

function checkedInspection(input: Omit<ListingImageInspection, 'pixels'>): ListingImageInspection {
  const { width, height } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new ListingImageSafetyError('invalid_dimensions', 'Image dimensions are invalid');
  }
  if (width > maximumListingImageDimension || height > maximumListingImageDimension) {
    throw new ListingImageSafetyError('pixel_limit_exceeded', 'Image dimensions exceed the allowed maximum');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > maximumListingImagePixels) {
    throw new ListingImageSafetyError('pixel_limit_exceeded', 'Decoded image size exceeds the allowed maximum');
  }
  return { ...input, pixels };
}

function readExifOrientation(payload: Buffer): number | null {
  if (payload.length < 14 || payload.toString('ascii', 0, 6) !== 'Exif\0\0') return null;
  const offset = 6;
  const byteOrder = payload.toString('ascii', offset, offset + 2);
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') return null;
  const read16 = (position: number) => littleEndian ? payload.readUInt16LE(position) : payload.readUInt16BE(position);
  const read32 = (position: number) => littleEndian ? payload.readUInt32LE(position) : payload.readUInt32BE(position);
  if (read16(offset + 2) !== 42) return null;
  const ifdOffset = read32(offset + 4);
  const ifd = offset + ifdOffset;
  if (ifd < offset || ifd + 2 > payload.length) return null;
  const entries = read16(ifd);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > payload.length) return null;
    if (read16(entry) !== 0x0112) continue;
    if (read16(entry + 2) !== 3 || read32(entry + 4) < 1) return null;
    const orientation = read16(entry + 8);
    return orientation >= 1 && orientation <= 8 ? orientation : null;
  }
  return null;
}

function inspectJpeg(buffer: Buffer): ListingImageInspection {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new ListingImageSafetyError('malformed_image', 'JPEG header is malformed');
  }
  let offset = 2;
  let width: number | null = null;
  let height: number | null = null;
  let orientation: number | null = null;
  let containsMetadata = false;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) throw new ListingImageSafetyError('malformed_image', 'JPEG segment is truncated');
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new ListingImageSafetyError('malformed_image', 'JPEG segment length is invalid');
    }
    const payloadStart = offset + 2;
    const payloadEnd = offset + segmentLength;

    if (marker >= 0xe0 && marker <= 0xef) {
      containsMetadata = true;
      if (marker === 0xe1 && orientation === null) {
        orientation = readExifOrientation(buffer.subarray(payloadStart, payloadEnd));
      }
    } else if (marker === 0xfe) {
      containsMetadata = true;
    }

    if (sofMarkers.has(marker)) {
      if (segmentLength < 7) throw new ListingImageSafetyError('malformed_image', 'JPEG frame header is truncated');
      height = buffer.readUInt16BE(payloadStart + 1);
      width = buffer.readUInt16BE(payloadStart + 3);
      break;
    }
    offset += segmentLength;
  }

  if (width === null || height === null) {
    throw new ListingImageSafetyError('malformed_image', 'JPEG dimensions are unavailable');
  }
  return checkedInspection({ width, height, orientation, containsMetadata });
}

function inspectPng(buffer: Buffer): ListingImageInspection {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    throw new ListingImageSafetyError('malformed_image', 'PNG header is malformed');
  }
  const ihdrLength = buffer.readUInt32BE(8);
  if (ihdrLength !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new ListingImageSafetyError('malformed_image', 'PNG IHDR is malformed');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  let offset = 8;
  let containsMetadata = false;
  let orientation: number | null = null;
  const metadataChunks = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'iCCP', 'tIME']);

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const next = dataEnd + 4;
    if (next > buffer.length) throw new ListingImageSafetyError('malformed_image', 'PNG chunk is truncated');
    if (metadataChunks.has(type)) {
      containsMetadata = true;
      if (type === 'eXIf' && orientation === null) {
        const exif = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), buffer.subarray(dataStart, dataEnd)]);
        orientation = readExifOrientation(exif);
      }
    }
    offset = next;
    if (type === 'IEND') break;
  }

  return checkedInspection({ width, height, orientation, containsMetadata });
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function inspectWebp(buffer: Buffer): ListingImageInspection {
  if (
    buffer.length < 20 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new ListingImageSafetyError('malformed_image', 'WebP header is malformed');
  }
  let offset = 12;
  let width: number | null = null;
  let height: number | null = null;
  let orientation: number | null = null;
  let containsMetadata = false;

  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) throw new ListingImageSafetyError('malformed_image', 'WebP chunk is truncated');

    if (type === 'EXIF' || type === 'XMP ' || type === 'ICCP') {
      containsMetadata = true;
      if (type === 'EXIF' && orientation === null) {
        const payload = buffer.subarray(dataStart, dataEnd);
        const exif = payload.toString('ascii', 0, 6) === 'Exif\0\0'
          ? payload
          : Buffer.concat([Buffer.from('Exif\0\0', 'binary'), payload]);
        orientation = readExifOrientation(exif);
      }
    }

    if (type === 'VP8X' && length >= 10) {
      width = readUInt24LE(buffer, dataStart + 4) + 1;
      height = readUInt24LE(buffer, dataStart + 7) + 1;
    } else if (type === 'VP8 ' && length >= 10 && buffer[dataStart + 3] === 0x9d && buffer[dataStart + 4] === 0x01 && buffer[dataStart + 5] === 0x2a) {
      width = buffer.readUInt16LE(dataStart + 6) & 0x3fff;
      height = buffer.readUInt16LE(dataStart + 8) & 0x3fff;
    } else if (type === 'VP8L' && length >= 5 && buffer[dataStart] === 0x2f) {
      const bits = buffer.readUInt32LE(dataStart + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }

    offset = dataEnd + (length % 2);
  }

  if (width === null || height === null) {
    throw new ListingImageSafetyError('malformed_image', 'WebP dimensions are unavailable');
  }
  return checkedInspection({ width, height, orientation, containsMetadata });
}

export function inspectListingImage(
  buffer: Buffer,
  mimeType: SupportedListingImageMime
): ListingImageInspection {
  if (mimeType === 'image/jpeg') return inspectJpeg(buffer);
  if (mimeType === 'image/png') return inspectPng(buffer);
  return inspectWebp(buffer);
}
