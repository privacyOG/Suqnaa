export const maximumListingMediaItems = 8;
export const maximumListingImageBytes = 4 * 1024 * 1024;

export const supportedListingImageMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export type SupportedListingImageMime = typeof supportedListingImageMimeTypes[number];

export function normalizeListingImageMime(
  value: string | string[] | undefined
): SupportedListingImageMime | null {
  const contentType = (Array.isArray(value) ? value[0] : value)
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();

  return supportedListingImageMimeTypes.includes(contentType as SupportedListingImageMime)
    ? contentType as SupportedListingImageMime
    : null;
}

export function detectListingImageMime(buffer: Buffer): SupportedListingImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function extensionForListingImage(
  mimeType: SupportedListingImageMime
): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
}
