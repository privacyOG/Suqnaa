import { closeDb } from '../db/index.js';
import { resolveListingLifecycleConfiguration } from '../config/listing-lifecycle-config.js';
import { runListingLifecycleSweep } from '../listings/listing-lifecycle-service.js';

const configuration = resolveListingLifecycleConfiguration();
let stopping = false;

function requestStop() {
  stopping = true;
}

process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);

try {
  while (!stopping) {
    const startedAt = new Date();
    const result = await runListingLifecycleSweep(startedAt);
    if (result.acquired) {
      console.log(JSON.stringify({
        event: 'listing_lifecycle_sweep',
        at: startedAt.toISOString(),
        expiredListings: result.expiredListingIds.length,
        releasedReservations: result.releasedOfferIds.length
      }));
    }

    if (stopping) break;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, configuration.workerIntervalSeconds * 1000);
    });
  }
} finally {
  await closeDb();
}
