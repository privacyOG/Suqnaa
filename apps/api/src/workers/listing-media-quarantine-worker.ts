import { db } from '../db/index.js';
import { getListingMediaStorage } from '../media/listing-media-storage.js';

export const listingMediaQuarantineBatchSize = 50;

export async function cleanupExpiredListingMediaQuarantine(input: {
  now?: Date;
  limit?: number;
  log?: Pick<Console, 'info' | 'warn'>;
} = {}): Promise<{ attempted: number; expired: number; failed: number }> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? listingMediaQuarantineBatchSize, 200));
  const log = input.log ?? console;
  const storage = getListingMediaStorage();

  const rows = await db.selectFrom('listing_media_quarantine')
    .select(['id', 'object_key'])
    .where('resolved_at', 'is', null)
    .where('expires_at', '<=', now)
    .orderBy('expires_at', 'asc')
    .limit(limit)
    .execute();

  let expired = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // Object deletion is intentionally first. S3 DeleteObject and local rm(force)
      // are idempotent, so duplicate workers remain safe if they race here.
      await storage.remove(String(row.object_key));
      const updated = await db.updateTable('listing_media_quarantine')
        .set({
          resolved_at: now,
          resolution: 'expired'
        })
        .where('id', '=', row.id)
        .where('resolved_at', 'is', null)
        .returning(['id'])
        .executeTakeFirst();
      if (updated) expired += 1;
    } catch (error) {
      failed += 1;
      log.warn({ error, quarantineId: row.id }, 'listing media quarantine cleanup failed');
    }
  }

  log.info({ attempted: rows.length, expired, failed }, 'listing media quarantine cleanup complete');
  return { attempted: rows.length, expired, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupExpiredListingMediaQuarantine()
    .then((result) => {
      if (result.failed > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
