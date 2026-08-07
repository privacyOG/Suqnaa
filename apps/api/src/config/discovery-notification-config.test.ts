import assert from 'node:assert/strict';
import { resolveDiscoveryNotificationConfiguration } from './discovery-notification-config.js';

assert.deepEqual(resolveDiscoveryNotificationConfiguration({}), {
  workerIntervalSeconds: 60,
  searchBatchSize: 50,
  matchBatchSize: 100,
  recentHistoryLimit: 100,
  savedListingLimit: 500,
  watchlistLimit: 200,
  savedSearchLimit: 50
});

assert.deepEqual(resolveDiscoveryNotificationConfiguration({
  DISCOVERY_NOTIFICATION_INTERVAL_SECONDS: '120',
  DISCOVERY_NOTIFICATION_SEARCH_BATCH_SIZE: '25',
  DISCOVERY_NOTIFICATION_MATCH_BATCH_SIZE: '40',
  RECENTLY_VIEWED_LIMIT: '80',
  SAVED_LISTING_LIMIT: '300',
  WATCHLIST_LIMIT: '150',
  SAVED_SEARCH_LIMIT: '30'
}), {
  workerIntervalSeconds: 120,
  searchBatchSize: 25,
  matchBatchSize: 40,
  recentHistoryLimit: 80,
  savedListingLimit: 300,
  watchlistLimit: 150,
  savedSearchLimit: 30
});

assert.throws(
  () => resolveDiscoveryNotificationConfiguration({ SAVED_SEARCH_LIMIT: '0' }),
  /greater than 0/
);

console.log('Discovery notification configuration tests passed.');
