import { randomUUID } from 'node:crypto';
import {
  detectListingImageMime,
  extensionForListingImage,
  normalizeListingImageMime,
  supportedListingImageMimeTypes,
  type SupportedListingImageMime
} from '../media/listing-media-upload.js';

export const maximumProfileAvatarBytes = 2 * 1024 * 1024;
export const supportedProfileAvatarMimeTypes = supportedListingImageMimeTypes;

export function normalizeProfileAvatarMime(value: string | string[] | undefined) {
  return normalizeListingImageMime(value);
}

export function detectProfileAvatarMime(buffer: Buffer) {
  return detectListingImageMime(buffer);
}

export function profileAvatarObjectKey(userId: string, mimeType: SupportedListingImageMime) {
  const extension = extensionForListingImage(mimeType);
  return `profile-avatars/${userId}/${randomUUID()}.${extension}`;
}
