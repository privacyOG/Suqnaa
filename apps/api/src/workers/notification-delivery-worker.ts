import { resolveNotificationDeliveryConfiguration } from '../config/notification-delivery-config.js';
import { closeDb } from '../db/index.js';
import {
  claimNotificationDeliveries,
  deliverClaimedNotification
} from '../notifications/service.js';
import { createNotificationDeliveryProvider } from '../notifications/provider.js';

const configuration = resolveNotificationDeliveryConfiguration();
const providers = {
  email: createNotificationDeliveryProvider(configuration.providers.email),
  sms: createNotificationDeliveryProvider(configuration.providers.sms),
  push: createNotificationDeliveryProvider(configuration.providers.push)
};

let stopping = false;
function requestStop() {
  stopping = true;
}
process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);

try {
  while (!stopping) {
    const claimed = await claimNotificationDeliveries({
      batchSize: configuration.batchSize,
      lockTimeoutMs: configuration.lockTimeoutMs
    });

    let sent = 0;
    let failed = 0;
    let dead = 0;
    for (const delivery of claimed) {
      const result = await deliverClaimedNotification({
        delivery,
        provider: providers[delivery.channel],
        maxAttempts: configuration.maxAttempts
      });
      if (result.outcome === 'sent') sent += 1;
      if (result.outcome === 'failed') failed += 1;
      if (result.outcome === 'dead') dead += 1;
    }

    if (claimed.length > 0) {
      console.log(JSON.stringify({
        event: 'notification_delivery_batch',
        claimed: claimed.length,
        sent,
        failed,
        dead,
        at: new Date().toISOString()
      }));
    }

    if (stopping) break;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, configuration.workerIntervalMs);
    });
  }
} finally {
  await closeDb();
}