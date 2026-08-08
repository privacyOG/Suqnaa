import { getAuthed, postAuthed } from './authed-api';

export interface SellerPayoutStatusPayload {
  payouts: {
    enabled: boolean;
    account: null | {
      onboardingStatus: 'onboarding' | 'restricted' | 'ready' | 'disabled';
      countryCode: string;
      defaultCurrency: string;
      transfersEnabled: boolean;
      payoutsEnabled: boolean;
      detailsSubmitted: boolean;
      requirementsDue: number;
      disabledReason: string | null;
      payoutInterval: 'daily' | 'weekly' | 'monthly';
      payoutAnchor: string;
      lastProviderSyncAt: string | null;
    };
    settlements: Array<{
      id: string;
      order_id: string;
      gross_amount: string;
      commission_amount: string;
      net_amount: string;
      currency_code: string;
      status: string;
      available_at: string;
      transferred_at: string | null;
      failure_code: string | null;
      created_at: string;
    }>;
    payoutEvents: Array<{
      provider_payout_reference: string | null;
      event_type: string;
      amount: string | null;
      currency_code: string | null;
      status: string | null;
      failure_code: string | null;
      occurred_at: string;
    }>;
  };
}

export interface SellerPayoutOnboardingPayload {
  onboarding: {
    accountId: string;
    onboardingStatus: string;
    hostedUrl: string;
    expiresAt: string;
  };
}

export function loadSellerPayoutStatus(): Promise<SellerPayoutStatusPayload> {
  return getAuthed<SellerPayoutStatusPayload>('/v1/account/payouts');
}

export function beginSellerPayoutOnboarding(locale: 'en' | 'ar'): Promise<SellerPayoutOnboardingPayload> {
  return postAuthed<SellerPayoutOnboardingPayload>('/v1/account/payouts/onboarding', { locale });
}

export function updateSellerPayoutSchedule(input:
  | { interval: 'daily' }
  | { interval: 'weekly'; anchor: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' }
  | { interval: 'monthly'; anchor: number }
): Promise<{ schedule: { interval: string; anchor: string } }> {
  return postAuthed('/v1/account/payouts/schedule', input);
}
