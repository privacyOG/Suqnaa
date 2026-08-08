export type NotificationChannel = 'email' | 'sms' | 'push';
export type NotificationProviderMode = 'disabled' | 'http';

export interface NotificationDeliveryPayload {
  deliveryId: string;
  notificationId: string;
  channel: NotificationChannel;
  destination: string;
  eventType: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  dedupeKey: string;
}

export interface NotificationProviderResult {
  providerMessageId?: string;
}

export interface NotificationDeliveryProvider {
  deliver(payload: NotificationDeliveryPayload): Promise<NotificationProviderResult>;
}

export interface NotificationProviderConfiguration {
  channel: NotificationChannel;
  mode: NotificationProviderMode;
  nodeEnv: 'development' | 'test' | 'production';
  endpoint?: string;
  token?: string;
  timeoutMs: number;
}

export function validateNotificationProviderConfiguration(
  input: NotificationProviderConfiguration
): NotificationProviderConfiguration {
  const endpoint = input.endpoint?.trim() ?? '';
  const token = input.token?.trim() ?? '';

  if (input.mode === 'http') {
    if (!endpoint || !token) {
      throw new Error(`${input.channel} notification provider configuration is incomplete`);
    }
    const url = new URL(endpoint);
    if (input.nodeEnv === 'production' && url.protocol !== 'https:') {
      throw new Error(`${input.channel} notification provider must use HTTPS in production`);
    }
  }

  return { ...input, endpoint, token };
}

class DisabledNotificationProvider implements NotificationDeliveryProvider {
  constructor(private readonly channel: NotificationChannel) {}

  async deliver(): Promise<NotificationProviderResult> {
    throw new Error(`${this.channel} notification delivery is disabled`);
  }
}

class HttpNotificationProvider implements NotificationDeliveryProvider {
  constructor(
    private readonly configuration: NotificationProviderConfiguration,
    private readonly fetcher: typeof fetch
  ) {}

  async deliver(payload: NotificationDeliveryPayload): Promise<NotificationProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs);
    try {
      const response = await this.fetcher(this.configuration.endpoint ?? '', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.configuration.token}`,
          'content-type': 'application/json',
          'idempotency-key': payload.dedupeKey
        },
        body: JSON.stringify({
          purpose: 'marketplace_notification',
          deliveryId: payload.deliveryId,
          notificationId: payload.notificationId,
          channel: payload.channel,
          destination: payload.destination,
          eventType: payload.eventType,
          title: payload.title,
          body: payload.body,
          metadata: payload.metadata,
          dedupeKey: payload.dedupeKey
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`${payload.channel} notification provider returned ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        return {};
      }

      const parsed = await response.json() as { id?: unknown; messageId?: unknown };
      const providerMessageId = typeof parsed.messageId === 'string'
        ? parsed.messageId
        : typeof parsed.id === 'string'
          ? parsed.id
          : undefined;
      return providerMessageId ? { providerMessageId } : {};
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createNotificationDeliveryProvider(
  configuration: NotificationProviderConfiguration,
  fetcher: typeof fetch = fetch
): NotificationDeliveryProvider {
  const validated = validateNotificationProviderConfiguration(configuration);
  if (validated.mode === 'disabled') {
    return new DisabledNotificationProvider(validated.channel);
  }
  return new HttpNotificationProvider(validated, fetcher);
}