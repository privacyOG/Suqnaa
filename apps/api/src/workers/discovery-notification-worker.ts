import { closeDb } from '../db/index.js';
import { resolveDiscoveryNotificationConfiguration } from '../config/discovery-notification-config.js';
import { runSavedSearchNotificationSweep } from '../discovery/discovery-service.js';

const configuration = resolveDiscoveryNotificationConfiguration();
let stopping = false;

function requestStop() {
  stopping = true;
}

process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);

try {
  while (!stopping) {
    const startedAt = new Date();
    const result = await runSavedSearchNotificationSweep(startedAt);
    if (result.acquired) {
      console.log(JSON.stringify({
        event: 'saved_search_notification_sweep',
        at: startedAt.toISOString(),
        searchesProcessed: result.searchesProcessed,
        matchesProcessed: result.matchesProcessed
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
