import { z } from 'zod';

const positiveInteger = z.coerce.number().int().positive();

export interface DiscoveryNotificationConfiguration {
  workerIntervalSeconds: number;
  searchBatchSize: number;
  matchBatchSize: number;
  recentHistoryLimit: number;
  savedListingLimit: number;
  watchlistLimit: number;
  savedSearchLimit: number;
}

export function resolveDiscoveryNotificationConfiguration(
  source: NodeJS.ProcessEnv = process.env
): DiscoveryNotificationConfiguration {
  return {
    workerIntervalSeconds: positiveInteger.max(60 * 60).default(60)
      .parse(source.DISCOVERY_NOTIFICATION_INTERVAL_SECONDS),
    searchBatchSize: positiveInteger.max(500).default(50)
      .parse(source.DISCOVERY_NOTIFICATION_SEARCH_BATCH_SIZE),
    matchBatchSize: positiveInteger.max(500).default(100)
      .parse(source.DISCOVERY_NOTIFICATION_MATCH_BATCH_SIZE),
    recentHistoryLimit: positiveInteger.max(500).default(100)
      .parse(source.RECENTLY_VIEWED_LIMIT),
    savedListingLimit: positiveInteger.max(5000).default(500)
      .parse(source.SAVED_LISTING_LIMIT),
    watchlistLimit: positiveInteger.max(2000).default(200)
      .parse(source.WATCHLIST_LIMIT),
    savedSearchLimit: positiveInteger.max(500).default(50)
      .parse(source.SAVED_SEARCH_LIMIT)
  };
}
