import { toTurnstileAction } from './challenge-verifier.js';

export const challengeActions = {
  accountLogin: toTurnstileAction('account.login'),
  accountRegister: toTurnstileAction('account.register'),
  listingCreate: toTurnstileAction('listing.create'),
  listingStatusUpdate: toTurnstileAction('listing.status_update'),
  messageCreate: toTurnstileAction('message.create'),
  offerCreate: toTurnstileAction('offer.create'),
  offerManage: toTurnstileAction('offer.manage'),
  orderCreate: toTurnstileAction('order.create'),
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
}

export function buildPublicChallengeConfiguration(
  input: ChallengeConfigurationInput
): PublicChallengeConfiguration {
  const siteKey = input.siteKey?.trim() ?? '';
  const secretKey = input.secretKey?.trim() ?? '';
  const enabled = input.provider === 'turnstile' && siteKey.length > 0 && secretKey.length > 0;

  return {
    provider: enabled ? 'turnstile' : 'none',
    enabled,
    siteKey: enabled ? siteKey : null,
    actions: challengeActions
  };
}
