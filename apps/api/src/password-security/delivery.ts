import {
  maskVerificationDestination,
  type VerificationChannel,
  type VerificationDeliveryMode
} from '../account-verification/provider.js';

export interface PasswordResetDeliveryInput {
  channel?: VerificationChannel;
  destination: string;
  token: string;
  expiresAt: Date;
}

export interface PasswordResetDeliveryProvider {
  deliver(input: PasswordResetDeliveryInput): Promise<void>;
}

export interface PasswordResetDeliveryConfiguration {
  mode: VerificationDeliveryMode;
  nodeEnv: 'development' | 'test' | 'production';
  endpoint?: string;
  token?: string;
  timeoutMs: number;
}

export function validatePasswordResetDeliveryConfiguration(
  input: PasswordResetDeliveryConfiguration
): PasswordResetDeliveryConfiguration {
  const endpoint = input.endpoint?.trim() ?? '';
  const token = input.token?.trim() ?? '';

  if (input.nodeEnv === 'production' && input.mode !== 'http') {
    throw new Error('Production password reset requires the HTTP delivery provider');
  }

  if (input.mode === 'http') {
    if (!endpoint || !token) {
      throw new Error('HTTP password reset delivery is incomplete');
    }

    const url = new URL(endpoint);
    if (input.nodeEnv === 'production' && url.protocol !== 'https:') {
      throw new Error('Production password reset delivery must use HTTPS');
    }
  }

  return {
    ...input,
    endpoint,
    token
  };
}

class DisabledPasswordResetDeliveryProvider implements PasswordResetDeliveryProvider {
  async deliver(): Promise<void> {
    throw new Error('Password reset delivery is disabled');
  }
}

class ConsolePasswordResetDeliveryProvider implements PasswordResetDeliveryProvider {
  async deliver(input: PasswordResetDeliveryInput): Promise<void> {
    const channel = input.channel ?? 'email';
    console.info(
      `[password-reset] channel=${channel} destination=${maskVerificationDestination(channel, input.destination)} token=${input.token} expires=${input.expiresAt.toISOString()}`
    );
  }
}

class HttpPasswordResetDeliveryProvider implements PasswordResetDeliveryProvider {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async deliver(input: PasswordResetDeliveryInput): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const channel = input.channel ?? 'email';

    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          purpose: 'account_password_reset',
          channel,
          destination: input.destination,
          token: input.token,
          expiresAt: input.expiresAt.toISOString()
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Password reset delivery failed with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createPasswordResetDeliveryProvider(
  configuration: PasswordResetDeliveryConfiguration,
  fetcher?: typeof fetch
): PasswordResetDeliveryProvider {
  const validated = validatePasswordResetDeliveryConfiguration(configuration);

  if (validated.mode === 'disabled') {
    return new DisabledPasswordResetDeliveryProvider();
  }
  if (validated.mode === 'console') {
    return new ConsolePasswordResetDeliveryProvider();
  }

  return new HttpPasswordResetDeliveryProvider(
    validated.endpoint ?? '',
    validated.token ?? '',
    validated.timeoutMs,
    fetcher
  );
}
