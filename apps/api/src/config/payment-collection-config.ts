export type PaymentCollectionProvider = 'stripe';

export interface PaymentCollectionConfiguration {
  enabled: boolean;
  provider: PaymentCollectionProvider | null;
  liveMode: boolean;
  secretKey: string;
  webhookSecret: string;
  apiBaseUrl: string;
  apiVersion: string;
  timeoutMs: number;
  webOrigin: string;
}

function trustedOrigin(value: string): string {
  const parsed = new URL(value);
  const developmentHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (
    (!developmentHost && parsed.protocol !== 'https:') ||
    (developmentHost && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('PAYMENT_COLLECTION_WEB_ORIGIN must be a trusted origin');
  }
  return parsed.origin;
}

export function resolvePaymentCollectionConfiguration(input: {
  nodeEnv: string;
  provider?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  liveApproved?: string;
  timeoutMs?: string;
  webOrigin?: string;
}): PaymentCollectionConfiguration {
  const provider = (input.provider ?? 'none').trim().toLowerCase();
  const secretKey = (input.stripeSecretKey ?? '').trim();
  const webhookSecret = (input.stripeWebhookSecret ?? '').trim();
  const webOrigin = (input.webOrigin ?? '').trim();
  const timeoutMs = Number(input.timeoutMs ?? '8000');

  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15000) {
    throw new Error('PAYMENT_COLLECTION_TIMEOUT_MS must be between 500 and 15000');
  }

  if (provider === 'none') {
    if (secretKey || webhookSecret) {
      throw new Error('Stripe payment secrets require PAYMENT_COLLECTION_PROVIDER=stripe');
    }
    return {
      enabled: false,
      provider: null,
      liveMode: false,
      secretKey: '',
      webhookSecret: '',
      apiBaseUrl: 'https://api.stripe.com',
      apiVersion: '2026-02-25.clover',
      timeoutMs,
      webOrigin: webOrigin ? trustedOrigin(webOrigin) : ''
    };
  }

  if (provider !== 'stripe') {
    throw new Error('Unsupported PAYMENT_COLLECTION_PROVIDER');
  }
  if (!/^sk_(?:test|live)_[A-Za-z0-9_]{12,}$/.test(secretKey)) {
    throw new Error('STRIPE_SECRET_KEY must be a Stripe test or live secret key');
  }
  if (!/^whsec_[A-Za-z0-9_]{12,}$/.test(webhookSecret)) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be a Stripe webhook secret');
  }
  if (!webOrigin) {
    throw new Error('PAYMENT_COLLECTION_WEB_ORIGIN is required');
  }

  const liveMode = secretKey.startsWith('sk_live_');
  if (liveMode && (input.nodeEnv !== 'production' || input.liveApproved !== 'true')) {
    throw new Error('Live payment collection requires production and explicit approval');
  }

  return {
    enabled: true,
    provider: 'stripe',
    liveMode,
    secretKey,
    webhookSecret,
    apiBaseUrl: 'https://api.stripe.com',
    apiVersion: '2026-02-25.clover',
    timeoutMs,
    webOrigin: trustedOrigin(webOrigin)
  };
}

export function paymentCollectionConfigurationFromEnvironment(): PaymentCollectionConfiguration {
  return resolvePaymentCollectionConfiguration({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    provider: process.env.PAYMENT_COLLECTION_PROVIDER,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    liveApproved: process.env.PAYMENT_COLLECTION_LIVE_APPROVED,
    timeoutMs: process.env.PAYMENT_COLLECTION_TIMEOUT_MS,
    webOrigin: process.env.PAYMENT_COLLECTION_WEB_ORIGIN ?? process.env.WEB_ORIGIN
  });
}
