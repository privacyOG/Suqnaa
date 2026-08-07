import { z } from 'zod';

const positiveInteger = z.coerce.number().int().positive();

export interface ListingLifecycleConfiguration {
  activeDays: number;
  renewalWindowDays: number;
  reservationMinutes: number;
  batchSize: number;
  workerIntervalSeconds: number;
}

export function resolveListingLifecycleConfiguration(
  source: NodeJS.ProcessEnv = process.env
): ListingLifecycleConfiguration {
  const activeDays = positiveInteger.max(365).default(30).parse(source.LISTING_ACTIVE_DAYS);
  const renewalWindowDays = positiveInteger.max(90).default(7).parse(source.LISTING_RENEWAL_WINDOW_DAYS);
  const reservationMinutes = positiveInteger.max(24 * 60).default(60).parse(source.LISTING_RESERVATION_MINUTES);
  const batchSize = positiveInteger.max(1000).default(100).parse(source.LISTING_LIFECYCLE_BATCH_SIZE);
  const workerIntervalSeconds = positiveInteger.max(60 * 60).default(60).parse(source.LISTING_LIFECYCLE_INTERVAL_SECONDS);

  if (renewalWindowDays > activeDays) {
    throw new Error('Listing renewal window cannot exceed the active listing duration');
  }

  return {
    activeDays,
    renewalWindowDays,
    reservationMinutes,
    batchSize,
    workerIntervalSeconds
  };
}

export function listingExpiryFrom(now: Date, activeDays: number): Date {
  return new Date(now.getTime() + activeDays * 24 * 60 * 60 * 1000);
}

export function reservationExpiryFrom(now: Date, reservationMinutes: number): Date {
  return new Date(now.getTime() + reservationMinutes * 60 * 1000);
}
