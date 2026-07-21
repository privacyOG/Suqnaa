export interface PaymentEventConfigurationInput {
  provider?: string;
  signingSecret?: string;
  maxAgeSeconds?: number;
}

export interface PaymentEventConfiguration {
  enabled: boolean;
  provider: string | null;
  signingSecret: string;
  maxAgeSeconds: number;
}

const providerPattern = /^[a-z0-9][a-z0-9_-]{1,39}$/;

export function resolvePaymentEventConfiguration(
  input: PaymentEventConfigurationInput
): PaymentEventConfiguration {
  const provider = (input.provider ?? 'none').trim().toLowerCase();
  const signingSecret = input.signingSecret?.trim() ?? '';
  const maxAgeSeconds = input.maxAgeSeconds ?? 300;

  if (
    !Number.isInteger(maxAgeSeconds) ||
    maxAgeSeconds < 30 ||
    maxAgeSeconds > 900
  ) {
    throw new Error(
      'PAYMENT_EVENT_MAX_AGE_SECONDS must be an integer from 30 to 900'
    );
  }

  if (provider === 'none') {
    if (signingSecret) {
      throw new Error(
        'PAYMENT_EVENT_SIGNING_SECRET requires an enabled payment event provider'
      );
    }
    return {
      enabled: false,
      provider: null,
      signingSecret: '',
      maxAgeSeconds
    };
  }

  if (!providerPattern.test(provider)) {
    throw new Error('PAYMENT_EVENT_PROVIDER must be a safe provider identifier');
  }
  if (signingSecret.length < 32 || signingSecret.length > 512) {
    throw new Error(
      'PAYMENT_EVENT_SIGNING_SECRET must contain 32 to 512 characters'
    );
  }

  return {
    enabled: true,
    provider,
    signingSecret,
    maxAgeSeconds
  };
}
