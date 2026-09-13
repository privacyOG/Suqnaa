export type PublicBetaFeature =
  | 'registration'
  | 'listing_write'
  | 'messaging'
  | 'trading'
  | 'payment_collection'
  | 'seller_verification'
  | 'seller_settlement'
  | 'disputes_reports';

export interface PublicBetaConfiguration {
  enabled: boolean;
  features: Record<PublicBetaFeature, boolean>;
  approvedPaymentProvider: 'none' | 'stripe_test' | 'stripe_live';
  approvedSellerVerificationProvider: string;
}

const explicitBoolean = (name: string, value: string | undefined): boolean => {
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be explicitly true or false when PUBLIC_BETA_ENABLED=true`);
  }
  return value === 'true';
};

const safeProvider = /^[a-z0-9][a-z0-9_-]{1,39}$/;

export function resolvePublicBetaConfiguration(input: NodeJS.ProcessEnv): PublicBetaConfiguration {
  const enabled = input.PUBLIC_BETA_ENABLED === 'true';
  const disabledFeatures: Record<PublicBetaFeature, boolean> = {
    registration: false,
    listing_write: false,
    messaging: false,
    trading: false,
    payment_collection: false,
    seller_verification: false,
    seller_settlement: false,
    disputes_reports: false
  };

  if (!enabled) {
    if (input.PUBLIC_BETA_ENABLED && input.PUBLIC_BETA_ENABLED !== 'false') {
      throw new Error('PUBLIC_BETA_ENABLED must be true or false');
    }
    return {
      enabled: false,
      features: disabledFeatures,
      approvedPaymentProvider: 'none',
      approvedSellerVerificationProvider: 'none'
    };
  }

  if ((input.NODE_ENV ?? 'development') !== 'production') {
    throw new Error('Public beta mode requires NODE_ENV=production');
  }

  const features: Record<PublicBetaFeature, boolean> = {
    registration: explicitBoolean('PUBLIC_BETA_REGISTRATION_ENABLED', input.PUBLIC_BETA_REGISTRATION_ENABLED),
    listing_write: explicitBoolean('PUBLIC_BETA_LISTING_WRITE_ENABLED', input.PUBLIC_BETA_LISTING_WRITE_ENABLED),
    messaging: explicitBoolean('PUBLIC_BETA_MESSAGING_ENABLED', input.PUBLIC_BETA_MESSAGING_ENABLED),
    trading: explicitBoolean('PUBLIC_BETA_TRADING_ENABLED', input.PUBLIC_BETA_TRADING_ENABLED),
    payment_collection: explicitBoolean('PUBLIC_BETA_PAYMENT_COLLECTION_ENABLED', input.PUBLIC_BETA_PAYMENT_COLLECTION_ENABLED),
    seller_verification: explicitBoolean('PUBLIC_BETA_SELLER_VERIFICATION_ENABLED', input.PUBLIC_BETA_SELLER_VERIFICATION_ENABLED),
    seller_settlement: explicitBoolean('PUBLIC_BETA_SELLER_SETTLEMENT_ENABLED', input.PUBLIC_BETA_SELLER_SETTLEMENT_ENABLED),
    disputes_reports: explicitBoolean('PUBLIC_BETA_DISPUTES_REPORTS_ENABLED', input.PUBLIC_BETA_DISPUTES_REPORTS_ENABLED)
  };

  const approvedPaymentProvider = (input.PUBLIC_BETA_APPROVED_PAYMENT_PROVIDER ?? '').trim().toLowerCase();
  if (!['none', 'stripe_test', 'stripe_live'].includes(approvedPaymentProvider)) {
    throw new Error('PUBLIC_BETA_APPROVED_PAYMENT_PROVIDER must be none, stripe_test, or stripe_live');
  }

  const configuredPaymentProvider = (input.PAYMENT_COLLECTION_PROVIDER ?? 'none').trim().toLowerCase();
  const stripeKey = (input.STRIPE_SECRET_KEY ?? '').trim();
  const configuredPaymentMode = configuredPaymentProvider === 'stripe'
    ? stripeKey.startsWith('sk_live_') ? 'stripe_live' : 'stripe_test'
    : configuredPaymentProvider;

  if (!features.payment_collection && configuredPaymentProvider !== 'none') {
    throw new Error('Payment collection provider must be disabled when the public-beta payment feature is disabled');
  }
  if (features.payment_collection && configuredPaymentMode !== approvedPaymentProvider) {
    throw new Error('Configured payment provider/mode is not approved for public beta');
  }
  if (approvedPaymentProvider === 'stripe_live' && input.PAYMENT_COLLECTION_LIVE_APPROVED !== 'true') {
    throw new Error('Public-beta live Stripe approval also requires PAYMENT_COLLECTION_LIVE_APPROVED=true');
  }

  const approvedSellerVerificationProvider = (input.PUBLIC_BETA_APPROVED_SELLER_VERIFICATION_PROVIDER ?? '').trim().toLowerCase();
  if (approvedSellerVerificationProvider !== 'none' && !safeProvider.test(approvedSellerVerificationProvider)) {
    throw new Error('PUBLIC_BETA_APPROVED_SELLER_VERIFICATION_PROVIDER must be none or a safe provider identifier');
  }
  if (!approvedSellerVerificationProvider) {
    throw new Error('PUBLIC_BETA_APPROVED_SELLER_VERIFICATION_PROVIDER is required');
  }

  const configuredSellerVerificationProvider = (input.SELLER_VERIFICATION_PROVIDER ?? 'none').trim().toLowerCase();
  if (!features.seller_verification && configuredSellerVerificationProvider !== 'none') {
    throw new Error('Seller verification provider must be disabled when the public-beta verification feature is disabled');
  }
  if (features.seller_verification && configuredSellerVerificationProvider !== approvedSellerVerificationProvider) {
    throw new Error('Configured seller verification provider is not approved for public beta');
  }

  if (!features.seller_settlement && input.SELLER_SETTLEMENT_ENABLED === 'true') {
    throw new Error('Seller settlement must be disabled when the public-beta settlement feature is disabled');
  }
  if (features.seller_settlement && input.SELLER_SETTLEMENT_ENABLED !== 'true') {
    throw new Error('Public-beta seller settlement flag requires SELLER_SETTLEMENT_ENABLED=true');
  }
  if (features.seller_settlement && input.SELLER_SETTLEMENT_LIVE_APPROVED !== 'true') {
    throw new Error('Public-beta seller settlement requires explicit live settlement approval');
  }

  return {
    enabled: true,
    features,
    approvedPaymentProvider: approvedPaymentProvider as PublicBetaConfiguration['approvedPaymentProvider'],
    approvedSellerVerificationProvider
  };
}

export function publicBetaFeatureForRoute(method: string, route: string): PublicBetaFeature | null {
  const verb = method.toUpperCase();
  if (verb === 'POST' && route === '/v1/auth/register') return 'registration';
  if (route.startsWith('/v1/listings') && verb !== 'GET' && verb !== 'HEAD') return 'listing_write';
  if (route.startsWith('/v1/messages') || route.startsWith('/v1/conversations')) return 'messaging';
  if (route.startsWith('/v1/market') || route.includes('/offers')) return 'trading';
  if (route.startsWith('/v1/payments') || route.includes('/checkout')) return 'payment_collection';
  if (route.startsWith('/v1/seller-verification')) return 'seller_verification';
  if (route.startsWith('/v1/seller-payouts') || route.startsWith('/v1/operations/settlements')) return 'seller_settlement';
  if (route.startsWith('/v1/disputes') || route.startsWith('/v1/reports')) return 'disputes_reports';
  return null;
}

export function publicBetaRequestAllowed(
  configuration: PublicBetaConfiguration,
  method: string,
  route: string
): boolean {
  if (!configuration.enabled) return true;
  const feature = publicBetaFeatureForRoute(method, route);
  return feature === null || configuration.features[feature];
}
