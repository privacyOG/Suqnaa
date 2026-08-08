import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';
import type {
  SellerSettlementConfiguration,
  SellerSettlementPayoutInterval
} from '../config/seller-settlement-config.js';
import { stripeMinorUnits, StripeProviderError } from './stripe-checkout-provider.js';

export interface StripeConnectedAccountState {
  id: string;
  country: string;
  defaultCurrency: string;
  detailsSubmitted: boolean;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: number;
  disabledReason: string | null;
}

export interface StripeAccountLink {
  url: string;
  expiresAt: Date;
}

export interface StripeTransferResult {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  sourceTransaction: string;
  transferGroup: string | null;
}

export interface StripeTransferReversalResult {
  id: string;
  transferId: string;
  amount: number;
  currency: string;
}

function providerId(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.startsWith(prefix) && value.length <= 255;
}

function trustedAccountLink(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && (
      parsed.hostname === 'connect.stripe.com' ||
      parsed.hostname.endsWith('.connect.stripe.com') ||
      parsed.hostname === 'accounts.stripe.com' ||
      parsed.hostname.endsWith('.accounts.stripe.com')
    );
  } catch {
    return false;
  }
}

function requirementsDue(payload: Record<string, unknown>): number {
  const requirements = payload.requirements;
  if (!requirements || typeof requirements !== 'object') return 0;
  const record = requirements as Record<string, unknown>;
  const due = [record.currently_due, record.past_due, record.pending_verification]
    .filter(Array.isArray)
    .flat() as unknown[];
  return new Set(due.map(String)).size;
}

function parseAccount(payload: Record<string, unknown>): StripeConnectedAccountState {
  if (!providerId(payload.id, 'acct_')) throw new StripeProviderError('connect_account_invalid');
  const capabilities = payload.capabilities && typeof payload.capabilities === 'object'
    ? payload.capabilities as Record<string, unknown>
    : {};
  const requirements = payload.requirements && typeof payload.requirements === 'object'
    ? payload.requirements as Record<string, unknown>
    : {};
  return {
    id: payload.id,
    country: typeof payload.country === 'string' ? payload.country.toUpperCase() : '',
    defaultCurrency: typeof payload.default_currency === 'string' ? payload.default_currency.toUpperCase() : '',
    detailsSubmitted: payload.details_submitted === true,
    transfersEnabled: capabilities.transfers === 'active',
    payoutsEnabled: payload.payouts_enabled === true,
    requirementsDue: requirementsDue(payload),
    disabledReason: typeof requirements.disabled_reason === 'string' ? requirements.disabled_reason : null
  };
}

export class StripeConnectProvider {
  constructor(
    private readonly paymentConfiguration: PaymentCollectionConfiguration,
    private readonly settlementConfiguration: SellerSettlementConfiguration,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  private assertEnabled(): void {
    if (
      !this.paymentConfiguration.enabled ||
      this.paymentConfiguration.provider !== 'stripe' ||
      !this.settlementConfiguration.enabled
    ) {
      throw new StripeProviderError('settlement_provider_disabled');
    }
    if (this.paymentConfiguration.liveMode && !this.settlementConfiguration.liveApproved) {
      throw new StripeProviderError('live_settlement_not_approved');
    }
  }

  private async request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    this.assertEnabled();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.paymentConfiguration.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${this.paymentConfiguration.secretKey}`);
      headers.set('stripe-version', this.paymentConfiguration.apiVersion);
      const response = await this.fetcher(`${this.paymentConfiguration.apiBaseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal
      });
      if (!response.ok) throw new StripeProviderError('settlement_provider_request_failed');
      const payload = await response.json();
      if (!payload || typeof payload !== 'object') throw new StripeProviderError('settlement_provider_response_invalid');
      return payload as Record<string, unknown>;
    } catch (error) {
      if (error instanceof StripeProviderError) throw error;
      throw new StripeProviderError('settlement_provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  async createConnectedAccount(input: { sellerId: string; email: string }): Promise<StripeConnectedAccountState> {
    const form = new URLSearchParams();
    form.set('country', 'AU');
    form.set('email', input.email);
    form.set('controller[fees][payer]', 'application');
    form.set('controller[losses][payments]', 'application');
    form.set('controller[stripe_dashboard][type]', 'express');
    form.set('capabilities[transfers][requested]', 'true');
    form.set('metadata[suqnaa_seller_id]', input.sellerId);
    const payload = await this.request('/v1/accounts', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': `suqnaa-connect-v1-${input.sellerId}`
      },
      body: form.toString()
    });
    const account = parseAccount(payload);
    if (account.country !== 'AU') throw new StripeProviderError('connect_account_country_invalid');
    return account;
  }

  async retrieveConnectedAccount(accountId: string): Promise<StripeConnectedAccountState> {
    if (!providerId(accountId, 'acct_')) throw new StripeProviderError('connect_account_invalid');
    return parseAccount(await this.request(`/v1/accounts/${encodeURIComponent(accountId)}`, { method: 'GET' }));
  }

  async createOnboardingLink(input: { accountId: string; refreshUrl: string; returnUrl: string }): Promise<StripeAccountLink> {
    if (!providerId(input.accountId, 'acct_')) throw new StripeProviderError('connect_account_invalid');
    const form = new URLSearchParams();
    form.set('account', input.accountId);
    form.set('refresh_url', input.refreshUrl);
    form.set('return_url', input.returnUrl);
    form.set('type', 'account_onboarding');
    form.set('collection_options[fields]', 'eventually_due');
    form.set('collection_options[future_requirements]', 'include');
    const payload = await this.request('/v1/account_links', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    if (!trustedAccountLink(payload.url) || typeof payload.expires_at !== 'number') {
      throw new StripeProviderError('connect_account_link_invalid');
    }
    return { url: payload.url, expiresAt: new Date(payload.expires_at * 1000) };
  }

  async updatePayoutSchedule(input: {
    accountId: string;
    interval: SellerSettlementPayoutInterval;
    anchor: string;
  }): Promise<void> {
    if (!providerId(input.accountId, 'acct_')) throw new StripeProviderError('connect_account_invalid');
    const form = new URLSearchParams();
    form.set('payments[payouts][schedule][interval]', input.interval);
    if (input.interval === 'weekly') {
      form.append('payments[payouts][schedule][weekly_payout_days][]', input.anchor);
    } else if (input.interval === 'monthly') {
      form.append('payments[payouts][schedule][monthly_payout_days][]', input.anchor);
    }
    await this.request('/v1/balance_settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'stripe-account': input.accountId
      },
      body: form.toString()
    });
  }

  async createTransfer(input: {
    settlementId: string;
    orderId: string;
    destinationAccountId: string;
    sourceChargeId: string;
    amount: string | number;
    currencyCode: string;
    idempotencyKey: string;
  }): Promise<StripeTransferResult> {
    if (!providerId(input.destinationAccountId, 'acct_')) throw new StripeProviderError('connect_account_invalid');
    if (!providerId(input.sourceChargeId, 'ch_')) throw new StripeProviderError('settlement_charge_invalid');
    const form = new URLSearchParams();
    form.set('amount', String(stripeMinorUnits(input.amount)));
    form.set('currency', input.currencyCode.toLowerCase());
    form.set('destination', input.destinationAccountId);
    form.set('source_transaction', input.sourceChargeId);
    form.set('transfer_group', `suqnaa_order_${input.orderId}`);
    form.set('metadata[suqnaa_settlement_id]', input.settlementId);
    form.set('metadata[suqnaa_order_id]', input.orderId);
    const payload = await this.request('/v1/transfers', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': input.idempotencyKey
      },
      body: form.toString()
    });
    if (
      !providerId(payload.id, 'tr_') ||
      typeof payload.amount !== 'number' ||
      typeof payload.currency !== 'string' ||
      (typeof payload.destination !== 'string' && typeof payload.destination !== 'object') ||
      !providerId(payload.source_transaction, 'ch_')
    ) {
      throw new StripeProviderError('settlement_transfer_invalid');
    }
    const destination = typeof payload.destination === 'string'
      ? payload.destination
      : String((payload.destination as Record<string, unknown>).id ?? '');
    return {
      id: payload.id,
      amount: payload.amount,
      currency: payload.currency.toUpperCase(),
      destination,
      sourceTransaction: payload.source_transaction,
      transferGroup: typeof payload.transfer_group === 'string' ? payload.transfer_group : null
    };
  }

  async reverseTransfer(input: {
    reversalId: string;
    transferId: string;
    amount: string | number;
    idempotencyKey: string;
  }): Promise<StripeTransferReversalResult> {
    if (!providerId(input.transferId, 'tr_')) throw new StripeProviderError('settlement_transfer_invalid');
    const form = new URLSearchParams();
    form.set('amount', String(stripeMinorUnits(input.amount)));
    form.set('metadata[suqnaa_reversal_id]', input.reversalId);
    const payload = await this.request(`/v1/transfers/${encodeURIComponent(input.transferId)}/reversals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': input.idempotencyKey
      },
      body: form.toString()
    });
    if (!providerId(payload.id, 'trr_') || typeof payload.amount !== 'number') {
      throw new StripeProviderError('settlement_reversal_invalid');
    }
    const transferId = typeof payload.transfer === 'string'
      ? payload.transfer
      : String((payload.transfer as Record<string, unknown> | undefined)?.id ?? '');
    return {
      id: payload.id,
      transferId,
      amount: payload.amount,
      currency: typeof payload.currency === 'string' ? payload.currency.toUpperCase() : 'AUD'
    };
  }
}
