import { toTurnstileAction } from './challenge-verifier.js';

export const challengeActions = {
  accountLogin: toTurnstileAction('account.login'),
  accountRegister: toTurnstileAction('account.register'),
  accountPasswordResetRequest: toTurnstileAction('account.password_reset_request'),
  accountSellerVerificationStart: toTurnstileAction('account.seller_verification_start'),
  listingCreate: toTurnstileAction('listing.create'),
  listingEdit: toTurnstileAction('listing.edit'),
  listingStatusUpdate: toTurnstileAction('listing.status_update'),
  listingMediaUpload: toTurnstileAction('listing.media_upload'),
  listingMediaDelete: toTurnstileAction('listing.media_delete'),
  messageCreate: toTurnstileAction('message.create'),
  offerCreate: toTurnstileAction('offer.create'),
  offerManage: toTurnstileAction('offer.manage'),
  orderCreate: toTurnstileAction('order.create'),
  orderCancel: toTurnstileAction('order.cancel'),
  fulfilmentManage: toTurnstileAction('fulfilment.manage'),
  fulfilmentConfirm: toTurnstileAction('fulfilment.confirm'),
  paymentCheckout: toTurnstileAction('payment.checkout_prepare'),
  reportCreate: toTurnstileAction('report.create')
} as const;

export interface PublicChallengeConfiguration {
  provider: 'none' | 'turnstile';
  enabled: boolean;
  siteKey: string | null;
  actions: typeof challengeActions;
}

export interface ChallengeConfigurationInput {
  provider: 'none' | 'turnstile';
  siteKey?: string;
  secretKey?: string;
  expectedHostname?: string;
  nodeEnv?: string;
}

export function buildPublicChallengeConfiguration(
  input: ChallengeConfigurationInput
): PublicChallengeConfiguration {
  const siteKey = input.siteKey?.trim() ?? '';
  const secretKey = input.secretKey?.trim() ?? '';
  const expectedHostname = input.expectedHostname?.trim() ?? '';
  const enabled = input.provider === 'turnstile' && siteKey.length > 0 && secretKey.length > 0;

  if (input.nodeEnv === 'production') {
    if (input.provider !== 'turnstile') {
      throw new Error('Production challenge provider must be enabled');
    }

    if (!enabled || !expectedHostname) {
      throw new Error('Challenge configuration is incomplete');
    }
  }

  return {
    provider: enabled ? 'turnstile' : 'none',
    enabled,
    siteKey: enabled ? siteKey : null,
    actions: challengeActions
  };
}
