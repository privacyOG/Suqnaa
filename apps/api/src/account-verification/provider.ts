export type VerificationChannel = 'email' | 'phone';
export type VerificationDeliveryMode = 'disabled' | 'console' | 'http';

export interface VerificationDeliveryInput {
  channel: VerificationChannel;
  destination: string;
  code: string;
  expiresAt: Date;
}

export interface VerificationDeliveryProvider {
  deliver(input: VerificationDeliveryInput): Promise<void>;
}

export interface VerificationDeliveryConfiguration {
  mode: VerificationDeliveryMode;
  nodeEnv: 'development' | 'test' | 'production';
  endpoint?: string;
  token?: string;
  timeoutMs: number;
}

export function validateVerificationDeliveryConfiguration(
  input: VerificationDeliveryConfiguration
): VerificationDeliveryConfiguration {
  const endpoint = input.endpoint?.trim() ?? '';
  const token = input.token?.trim() ?? '';

  if (input.nodeEnv === 'production' && input.mode !== 'http') {
    throw new Error('Production contact verification requires the HTTP delivery provider');
  }

  if (input.mode === 'http') {
    if (!endpoint || !token) {
      throw new Error('HTTP contact verification delivery is incomplete');
    }

    const url = new URL(endpoint);
    if (input.nodeEnv === 'production' && url.protocol !== 'https:') {
      throw new Error('Production contact verification delivery must use HTTPS');
    }
  }

  return {
    ...input,
    endpoint,
    token
  };
}

export class DisabledVerificationDeliveryProvider implements VerificationDeliveryProvider {
  async deliver(): Promise<void> {
    throw new Error('Contact verification delivery is disabled');
  }
}

export class ConsoleVerificationDeliveryProvider implements VerificationDeliveryProvider {
  async deliver(input: VerificationDeliveryInput): Promise<void> {
    const destination = maskVerificationDestination(input.channel, input.destination);
    console.info(
      `[contact-verification] channel=${input.channel} destination=${destination} code=${input.code} expires=${input.expiresAt.toISOString()}`
    );
  }
}

export class HttpVerificationDeliveryProvider implements VerificationDeliveryProvider {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async deliver(input: VerificationDeliveryInput): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          purpose: 'account_contact_verification',
          channel: input.channel,
          destination: input.destination,
          code: input.code,
          expiresAt: input.expiresAt.toISOString()
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Contact verification delivery failed with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createVerificationDeliveryProvider(
  configuration: VerificationDeliveryConfiguration,
  fetcher?: typeof fetch
): VerificationDeliveryProvider {
  const validated = validateVerificationDeliveryConfiguration(configuration);

  if (validated.mode === 'disabled') {
    return new DisabledVerificationDeliveryProvider();
  }
  if (validated.mode === 'console') {
    return new ConsoleVerificationDeliveryProvider();
  }

  return new HttpVerificationDeliveryProvider(
    validated.endpoint ?? '',
    validated.token ?? '',
    validated.timeoutMs,
    fetcher
  );
}

export function maskVerificationDestination(
  channel: VerificationChannel,
  destination: string
): string {
  if (channel === 'email') {
    const [local, domain] = destination.split('@');
    if (!local || !domain) {
      return '***';
    }
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
  }

  const digits = destination.replace(/\D/g, '');
  if (digits.length <= 4) {
    return `***${digits}`;
  }
  return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}
