import type {
  NotificationChannel,
  NotificationProviderConfiguration,
  NotificationProviderMode
} from '../notifications/provider.js';

function providerMode(value: string | undefined): NotificationProviderMode {
  return value?.trim().toLowerCase() === 'http' ? 'http' : 'disabled';
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface NotificationDeliveryConfiguration {
  nodeEnv: 'development' | 'test' | 'production';
  workerIntervalMs: number;
  batchSize: number;
  lockTimeoutMs: number;
  maxAttempts: number;
  providers: Record<NotificationChannel, NotificationProviderConfiguration>;
}

export function resolveNotificationDeliveryConfiguration(
  source: NodeJS.ProcessEnv = process.env
): NotificationDeliveryConfiguration {
  const nodeEnv = source.NODE_ENV === 'production'
    ? 'production'
    : source.NODE_ENV === 'test'
      ? 'test'
      : 'development';
  const timeoutMs = Math.min(
    15_000,
    Math.max(500, positiveInteger(source.NOTIFICATION_PROVIDER_TIMEOUT_MS, 5_000))
  );

  const provider = (
    channel: NotificationChannel,
    prefix: 'EMAIL' | 'SMS' | 'PUSH'
  ): NotificationProviderConfiguration => ({
    channel,
    nodeEnv,
    mode: providerMode(source[`NOTIFICATION_${prefix}_PROVIDER`]),
    endpoint: source[`NOTIFICATION_${prefix}_URL`],
    token: source[`NOTIFICATION_${prefix}_TOKEN`],
    timeoutMs
  });

  return {
    nodeEnv,
    workerIntervalMs: Math.min(
      60_000,
      Math.max(1_000, positiveInteger(source.NOTIFICATION_WORKER_INTERVAL_MS, 5_000))
    ),
    batchSize: Math.min(
      200,
      Math.max(1, positiveInteger(source.NOTIFICATION_WORKER_BATCH_SIZE, 50))
    ),
    lockTimeoutMs: Math.min(
      60 * 60 * 1000,
      Math.max(30_000, positiveInteger(source.NOTIFICATION_DELIVERY_LOCK_TIMEOUT_MS, 5 * 60 * 1000))
    ),
    maxAttempts: Math.min(
      20,
      Math.max(1, positiveInteger(source.NOTIFICATION_DELIVERY_MAX_ATTEMPTS, 8))
    ),
    providers: {
      email: provider('email', 'EMAIL'),
      sms: provider('sms', 'SMS'),
      push: provider('push', 'PUSH')
    }
  };
}