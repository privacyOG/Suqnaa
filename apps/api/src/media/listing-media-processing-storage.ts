import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import type { ListingImageDerivative } from './listing-image-transform.js';
import type { ListingMediaStorage, StoredMediaObject } from './listing-media-storage.js';

export type ReadyListingMediaInput = {
  listingId: string;
  mediaId: string;
  sortOrder: number;
  altText: string | null;
  publicImage: ListingImageDerivative;
  thumbnail: ListingImageDerivative;
};

export type QuarantinedListingMediaInput = {
  listingId: string;
  mediaId: string;
  publicImage: ListingImageDerivative;
  reviewProvider: string;
  reviewReference: string | null;
  reasonCodes: string[];
  expiresAt: Date;
};

async function removeAll(storage: ListingMediaStorage, objects: Array<StoredMediaObject | undefined>) {
  await Promise.allSettled(
    objects.filter((object): object is StoredMediaObject => Boolean(object))
      .map((object) => storage.remove(object.objectKey))
  );
}

export async function persistReadyListingMedia(
  storage: ListingMediaStorage,
  input: ReadyListingMediaInput
) {
  const publicObjectKey = `listing-media/${input.listingId}/${input.mediaId}.webp`;
  const thumbnailObjectKey = `listing-media/${input.listingId}/${input.mediaId}.thumbnail.webp`;
  let publicStored: StoredMediaObject | undefined;
  let thumbnailStored: StoredMediaObject | undefined;

  try {
    publicStored = await storage.put({
      objectKey: publicObjectKey,
      buffer: input.publicImage.buffer,
      mimeType: input.publicImage.mimeType
    });
    thumbnailStored = await storage.put({
      objectKey: thumbnailObjectKey,
      buffer: input.thumbnail.buffer,
      mimeType: input.thumbnail.mimeType
    });

    return await db.transaction().execute(async (transaction) => {
      const media = await transaction.insertInto('listing_media').values({
        id: input.mediaId,
        listing_id: input.listingId,
        object_key: publicStored!.objectKey,
        mime_type: input.publicImage.mimeType,
        width: input.publicImage.width,
        height: input.publicImage.height,
        size_bytes: input.publicImage.buffer.length,
        sort_order: input.sortOrder,
        alt_text: input.altText,
        sha256: publicStored!.sha256
      }).returning([
        'id', 'listing_id', 'mime_type', 'width', 'height', 'size_bytes',
        'sort_order', 'alt_text', 'created_at'
      ]).executeTakeFirstOrThrow();

      await transaction.insertInto('listing_media_derivatives').values({
        id: randomUUID(),
        media_id: input.mediaId,
        kind: 'thumbnail',
        object_key: thumbnailStored!.objectKey,
        mime_type: input.thumbnail.mimeType,
        width: input.thumbnail.width,
        height: input.thumbnail.height,
        size_bytes: input.thumbnail.buffer.length,
        sha256: thumbnailStored!.sha256
      }).executeTakeFirstOrThrow();

      return media;
    });
  } catch (error) {
    await removeAll(storage, [publicStored, thumbnailStored]);
    throw error;
  }
}

export async function persistQuarantinedListingMedia(
  storage: ListingMediaStorage,
  input: QuarantinedListingMediaInput
): Promise<StoredMediaObject> {
  const objectKey = `listing-media-quarantine/${input.listingId}/${input.mediaId}.webp`;
  let stored: StoredMediaObject | undefined;

  try {
    stored = await storage.put({
      objectKey,
      buffer: input.publicImage.buffer,
      mimeType: input.publicImage.mimeType
    });
    await db.insertInto('listing_media_quarantine').values({
      id: input.mediaId,
      listing_id: input.listingId,
      object_key: stored.objectKey,
      mime_type: input.publicImage.mimeType,
      width: input.publicImage.width,
      height: input.publicImage.height,
      size_bytes: input.publicImage.buffer.length,
      sha256: stored.sha256,
      review_provider: input.reviewProvider,
      review_reference: input.reviewReference,
      review_reason_codes: JSON.stringify(input.reasonCodes),
      expires_at: input.expiresAt
    }).executeTakeFirstOrThrow();
    return stored;
  } catch (error) {
    await removeAll(storage, [stored]);
    throw error;
  }
}
