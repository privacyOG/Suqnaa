import assert from 'node:assert/strict';
import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';
import type { SellerSettlementConfiguration } from '../config/seller-settlement-config.js';
import { StripeConnectProvider } from './stripe-connect-provider.js';
import { StripeProviderError } from './stripe-checkout-provider.js';

const payment: PaymentCollectionConfiguration = {
  enabled: true,
  provider: 'stripe',
  liveMode: false,
  secretKey: 'sk_test_1234567890abcdef',
  webhookSecret: 'whsec_1234567890abcdef',
  apiBaseUrl: 'https://api.stripe.com',
  apiVersion: '2026-02-25.clover',
  timeoutMs: 5000,
  webOrigin: 'https://suqnaa.example'
};
const settlement: SellerSettlementConfiguration = {
  enabled: true,
  liveApproved: false,
  commissionBps: 750,
  settlementDelayDays: 2,
  payoutInterval: 'weekly',
  payoutAnchor: 'friday',
  workerBatchSize: 50,
  workerIntervalMs: 15000,
  connectWebhookSecret: 'whsec_connect_1234567890abcdef'
};

const requests: Array<{ url: string; init: RequestInit }> = [];
const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
  requests.push({ url: String(url), init: init ?? {} });
  const path = new URL(String(url)).pathname;
  if (path === '/v1/accounts') {
    return new Response(JSON.stringify({
      id: 'acct_test_12345678', country: 'AU', default_currency: 'aud',
      details_submitted: false, payouts_enabled: false,
      capabilities: { transfers: 'pending' },
      requirements: { currently_due: ['business_profile.url'] }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/v1/account_links') {
    return new Response(JSON.stringify({
      url: 'https://connect.stripe.com/setup/test-link', expires_at: 1786200000
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/v1/balance_settings') {
    return new Response(JSON.stringify({ payments: { payouts: { schedule: { interval: 'weekly' } } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/v1/transfers') {
    const form = new URLSearchParams(String(init?.body ?? ''));
    return new Response(JSON.stringify({
      id: 'tr_test_12345678', amount: Number(form.get('amount')), currency: 'aud',
      destination: form.get('destination'), source_transaction: form.get('source_transaction'),
      transfer_group: form.get('transfer_group')
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path.endsWith('/reversals')) {
    const form = new URLSearchParams(String(init?.body ?? ''));
    return new Response(JSON.stringify({
      id: 'trr_test_12345678', transfer: 'tr_test_12345678', amount: Number(form.get('amount')), currency: 'aud'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected path ${path}`);
}) as typeof fetch;

const provider = new StripeConnectProvider(payment, settlement, fetcher);
const account = await provider.createConnectedAccount({
  sellerId: '123e4567-e89b-42d3-a456-426614174000',
  email: 'seller@example.test'
});
assert.equal(account.id, 'acct_test_12345678');
assert.equal(account.country, 'AU');
assert.equal(account.requirementsDue, 1);
const createForm = new URLSearchParams(String(requests[0].init.body));
assert.equal(createForm.get('capabilities[transfers][requested]'), 'true');
assert.equal(createForm.get('controller[stripe_dashboard][type]'), 'express');
assert.equal(new Headers(requests[0].init.headers).get('idempotency-key'), 'suqnaa-connect-v1-123e4567-e89b-42d3-a456-426614174000');

const link = await provider.createOnboardingLink({
  accountId: account.id,
  refreshUrl: 'https://suqnaa.example/en/account/payouts?connect=refresh',
  returnUrl: 'https://suqnaa.example/en/account/payouts?connect=return'
});
assert.match(link.url, /^https:\/\/connect\.stripe\.com\//);

await provider.updatePayoutSchedule({ accountId: account.id, interval: 'weekly', anchor: 'friday' });
const scheduleRequest = requests.at(-1)!;
assert.equal(new Headers(scheduleRequest.init.headers).get('stripe-account'), account.id);
assert.equal(new URLSearchParams(String(scheduleRequest.init.body)).get('payments[payouts][schedule][weekly_payout_days][]'), 'friday');

const transfer = await provider.createTransfer({
  settlementId: '123e4567-e89b-42d3-a456-426614174001',
  orderId: '123e4567-e89b-42d3-a456-426614174002',
  destinationAccountId: account.id,
  sourceChargeId: 'ch_test_12345678',
  amount: '92.50',
  currencyCode: 'AUD',
  idempotencyKey: 'suqnaa-settlement-v1-123e4567-e89b-42d3-a456-426614174001'
});
assert.equal(transfer.amount, 9250);
assert.equal(transfer.destination, account.id);
assert.equal(transfer.sourceTransaction, 'ch_test_12345678');
const transferRequest = requests.at(-1)!;
assert.equal(new Headers(transferRequest.init.headers).get('idempotency-key'), 'suqnaa-settlement-v1-123e4567-e89b-42d3-a456-426614174001');

const reversal = await provider.reverseTransfer({
  reversalId: '123e4567-e89b-42d3-a456-426614174003',
  transferId: transfer.id,
  amount: '23.13',
  idempotencyKey: 'suqnaa-transfer-reversal-v1-123e4567-e89b-42d3-a456-426614174003'
});
assert.equal(reversal.amount, 2313);

const livePayment = { ...payment, liveMode: true, secretKey: 'sk_live_1234567890abcdef' };
const liveProvider = new StripeConnectProvider(livePayment, settlement, fetcher);
await assert.rejects(
  liveProvider.createConnectedAccount({ sellerId: '123e4567-e89b-42d3-a456-426614174004', email: 'live@example.test' }),
  (error: unknown) => error instanceof StripeProviderError && error.safeCode === 'live_settlement_not_approved'
);

console.log('Stripe Connect settlement provider tests passed.');
