import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import type { SellerSettlementConfiguration, SellerSettlementPayoutInterval } from '../config/seller-settlement-config.js';
import { sellerSettlementConfigurationFromEnvironment } from '../config/seller-settlement-config.js';
import { paymentCollectionConfigurationFromEnvironment } from '../config/payment-collection-config.js';
import { stripeMinorUnits, StripeProviderError } from '../payments/stripe-checkout-provider.js';
import { StripeConnectProvider, type StripeConnectedAccountState } from '../payments/stripe-connect-provider.js';
import type { StripeConnectEvent } from '../payments/stripe-connect-webhook.js';

export class SellerSettlementError extends Error {
  constructor(readonly code: string, readonly statusCode = 409) {
    super(code);
  }
}

type TransactionExecutor = any;

function money(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new SellerSettlementError('settlement_amount_invalid');
  return Math.round(parsed * 100) / 100;
}

function amount(value: number): string {
  return value.toFixed(2);
}

function commissionFor(gross: number, bps: number): number {
  return Math.round(gross * bps) / 10000;
}

function accountStatus(state: StripeConnectedAccountState): 'onboarding' | 'restricted' | 'ready' {
  if (state.detailsSubmitted && state.transfersEnabled && state.payoutsEnabled && state.requirementsDue === 0) return 'ready';
  if (state.detailsSubmitted) return 'restricted';
  return 'onboarding';
}

async function verifiedSeller(executor: TransactionExecutor, sellerId: string): Promise<boolean> {
  const check = await executor.selectFrom('verification_checks')
    .select(['id'])
    .where('user_id', '=', sellerId)
    .where('level', 'in', ['seller', 'business'])
    .where('status', '=', 'verified')
    .where('expires_at', '>', new Date())
    .orderBy('verified_at', 'desc')
    .executeTakeFirst();
  return Boolean(check);
}

async function persistAccountState(
  executor: TransactionExecutor,
  sellerId: string,
  state: StripeConnectedAccountState,
  configuration: SellerSettlementConfiguration
) {
  const now = new Date();
  const status = accountStatus(state);
  const existing = await executor.selectFrom('seller_payout_accounts')
    .select(['id'])
    .where('seller_id', '=', sellerId)
    .executeTakeFirst();
  if (existing) {
    await executor.updateTable('seller_payout_accounts').set({
      provider_account_reference: state.id,
      country_code: state.country,
      default_currency: state.defaultCurrency,
      onboarding_status: status,
      transfers_enabled: state.transfersEnabled,
      payouts_enabled: state.payoutsEnabled,
      details_submitted: state.detailsSubmitted,
      requirements_due: state.requirementsDue,
      disabled_reason: state.disabledReason,
      last_provider_sync_at: now,
      updated_at: now
    }).where('id', '=', existing.id).execute();
    return String(existing.id);
  }
  const created = await executor.insertInto('seller_payout_accounts').values({
    seller_id: sellerId,
    provider: 'stripe',
    provider_account_reference: state.id,
    country_code: state.country,
    default_currency: state.defaultCurrency,
    onboarding_status: status,
    transfers_enabled: state.transfersEnabled,
    payouts_enabled: state.payoutsEnabled,
    details_submitted: state.detailsSubmitted,
    requirements_due: state.requirementsDue,
    disabled_reason: state.disabledReason,
    payout_interval: configuration.payoutInterval,
    payout_anchor: configuration.payoutAnchor,
    last_provider_sync_at: now,
    created_at: now,
    updated_at: now
  }).returning(['id']).executeTakeFirstOrThrow();
  return String(created.id);
}

export async function beginSellerPayoutOnboarding(input: {
  sellerId: string;
  provider: StripeConnectProvider;
  configuration: SellerSettlementConfiguration;
  webOrigin: string;
}) {
  if (!input.configuration.enabled) throw new SellerSettlementError('seller_settlement_disabled', 503);
  const seller = await db.selectFrom('users').select(['id', 'email', 'status'])
    .where('id', '=', input.sellerId).executeTakeFirst();
  if (!seller || seller.status !== 'active' || typeof seller.email !== 'string') {
    throw new SellerSettlementError('seller_account_invalid', 403);
  }
  if (!await verifiedSeller(db, input.sellerId)) {
    throw new SellerSettlementError('seller_verification_required', 403);
  }

  let account = await db.selectFrom('seller_payout_accounts').selectAll()
    .where('seller_id', '=', input.sellerId).executeTakeFirst();
  let state: StripeConnectedAccountState;
  if (!account) {
    state = await input.provider.createConnectedAccount({ sellerId: input.sellerId, email: seller.email });
    await persistAccountState(db, input.sellerId, state, input.configuration);
    account = await db.selectFrom('seller_payout_accounts').selectAll()
      .where('seller_id', '=', input.sellerId).executeTakeFirstOrThrow();
    await input.provider.updatePayoutSchedule({
      accountId: state.id,
      interval: input.configuration.payoutInterval,
      anchor: input.configuration.payoutAnchor
    });
  } else {
    state = await input.provider.retrieveConnectedAccount(String(account.provider_account_reference));
    await persistAccountState(db, input.sellerId, state, input.configuration);
  }

  const base = `${input.webOrigin}/en/account/payouts`;
  const link = await input.provider.createOnboardingLink({
    accountId: state.id,
    refreshUrl: `${base}?connect=refresh`,
    returnUrl: `${base}?connect=return`
  });
  return {
    accountId: String(account.id),
    onboardingStatus: accountStatus(state),
    hostedUrl: link.url,
    expiresAt: link.expiresAt.toISOString()
  };
}

export async function updateSellerPayoutSchedule(input: {
  sellerId: string;
  interval: SellerSettlementPayoutInterval;
  anchor: string;
  provider: StripeConnectProvider;
}) {
  const account = await db.selectFrom('seller_payout_accounts').selectAll()
    .where('seller_id', '=', input.sellerId).executeTakeFirst();
  if (!account) throw new SellerSettlementError('payout_account_missing', 404);
  await input.provider.updatePayoutSchedule({
    accountId: String(account.provider_account_reference),
    interval: input.interval,
    anchor: input.anchor
  });
  await db.updateTable('seller_payout_accounts').set({
    payout_interval: input.interval,
    payout_anchor: input.interval === 'daily' ? 'daily' : input.anchor,
    updated_at: new Date()
  }).where('id', '=', account.id).execute();
  return { interval: input.interval, anchor: input.interval === 'daily' ? 'daily' : input.anchor };
}

export async function readSellerPayoutStatus(sellerId: string) {
  const account = await db.selectFrom('seller_payout_accounts').selectAll()
    .where('seller_id', '=', sellerId).executeTakeFirst();
  const settlements = await db.selectFrom('seller_settlements')
    .select(['id', 'order_id', 'gross_amount', 'commission_amount', 'net_amount', 'currency_code', 'status', 'available_at', 'transferred_at', 'failure_code', 'created_at'])
    .where('seller_id', '=', sellerId)
    .orderBy('created_at', 'desc')
    .limit(100)
    .execute();
  const payoutEvents = account
    ? await db.selectFrom('seller_payout_events')
      .select(['provider_payout_reference', 'event_type', 'amount', 'currency_code', 'status', 'failure_code', 'occurred_at'])
      .where('payout_account_id', '=', account.id)
      .orderBy('occurred_at', 'desc')
      .limit(50)
      .execute()
    : [];
  return {
    enabled: sellerSettlementConfigurationFromEnvironment().enabled,
    account: account ? {
      onboardingStatus: account.onboarding_status,
      countryCode: account.country_code,
      defaultCurrency: account.default_currency,
      transfersEnabled: account.transfers_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirementsDue: account.requirements_due,
      disabledReason: account.disabled_reason,
      payoutInterval: account.payout_interval,
      payoutAnchor: account.payout_anchor,
      lastProviderSyncAt: account.last_provider_sync_at
    } : null,
    settlements,
    payoutEvents
  };
}

export async function ensureSettlementForReleasedPayment(
  executor: TransactionExecutor,
  input: { orderId: string; paymentIntentId: string; now: Date }
): Promise<void> {
  const configuration = sellerSettlementConfigurationFromEnvironment();
  if (!configuration.enabled) return;
  const existing = await executor.selectFrom('seller_settlements').select(['id'])
    .where('payment_intent_id', '=', input.paymentIntentId).executeTakeFirst();
  if (existing) return;
  const order = await executor.selectFrom('transactions')
    .select(['id', 'seller_id', 'amount', 'currency_code', 'status'])
    .where('id', '=', input.orderId).executeTakeFirstOrThrow();
  const intent = await executor.selectFrom('payment_intents')
    .select(['id', 'status'])
    .where('id', '=', input.paymentIntentId).executeTakeFirstOrThrow();
  const receipt = await executor.selectFrom('payment_receipts')
    .select(['provider_charge_reference'])
    .where('payment_intent_id', '=', input.paymentIntentId).executeTakeFirst();
  if (order.status !== 'released' || intent.status !== 'released' || !receipt?.provider_charge_reference) {
    throw new SellerSettlementError('settlement_release_context_invalid');
  }
  const payoutAccount = await executor.selectFrom('seller_payout_accounts').selectAll()
    .where('seller_id', '=', order.seller_id).executeTakeFirst();
  const gross = money(order.amount);
  const commission = commissionFor(gross, configuration.commissionBps);
  const net = gross - commission;
  const settlementId = randomUUID();
  const status = payoutAccount?.onboarding_status === 'ready' ? 'scheduled' : 'blocked';
  const availableAt = new Date(input.now.getTime() + configuration.settlementDelayDays * 86400000);
  await executor.insertInto('seller_settlements').values({
    id: settlementId,
    order_id: order.id,
    payment_intent_id: intent.id,
    seller_id: order.seller_id,
    payout_account_id: payoutAccount?.id ?? null,
    gross_amount: amount(gross),
    commission_bps: configuration.commissionBps,
    commission_amount: amount(commission),
    net_amount: amount(net),
    currency_code: String(order.currency_code).toUpperCase(),
    status,
    source_charge_reference: receipt.provider_charge_reference,
    transfer_idempotency_key: `suqnaa-settlement-v1-${settlementId}`,
    available_at: availableAt,
    created_at: input.now,
    updated_at: input.now
  }).execute();
  if (gross > 0) await executor.insertInto('settlement_ledger_entries').values({
    settlement_id: settlementId,
    entry_type: 'gross_sale',
    amount: amount(gross),
    currency_code: String(order.currency_code).toUpperCase(),
    reference: `release:${input.paymentIntentId}`,
    created_at: input.now
  }).execute();
  if (commission > 0) await executor.insertInto('settlement_ledger_entries').values({
    settlement_id: settlementId,
    entry_type: 'platform_commission',
    amount: amount(-commission),
    currency_code: String(order.currency_code).toUpperCase(),
    reference: `commission:${input.paymentIntentId}`,
    created_at: input.now
  }).execute();
  if (net > 0) await executor.insertInto('settlement_ledger_entries').values({
    settlement_id: settlementId,
    entry_type: 'seller_payable',
    amount: amount(net),
    currency_code: String(order.currency_code).toUpperCase(),
    reference: `payable:${input.paymentIntentId}`,
    created_at: input.now
  }).execute();
}

export async function recordSettlementAdjustment(
  executor: TransactionExecutor,
  input: {
    paymentIntentId: string;
    paymentOperationId: string | null;
    kind: 'refund' | 'chargeback';
    grossAdjustmentAmount: string | number;
    now: Date;
  }
): Promise<void> {
  const settlement = await executor.selectFrom('seller_settlements').selectAll()
    .where('payment_intent_id', '=', input.paymentIntentId).forUpdate().executeTakeFirst();
  if (!settlement) return;
  if (input.paymentOperationId) {
    const duplicate = await executor.selectFrom('settlement_reversals').select(['id'])
      .where('payment_operation_id', '=', input.paymentOperationId).executeTakeFirst();
    if (duplicate) return;
  }
  const grossAdjustment = Math.min(money(input.grossAdjustmentAmount), money(settlement.gross_amount));
  if (grossAdjustment <= 0) return;
  const commissionShare = commissionFor(grossAdjustment, Number(settlement.commission_bps));
  const sellerShare = grossAdjustment - commissionShare;
  await executor.insertInto('settlement_ledger_entries').values({
    settlement_id: settlement.id,
    entry_type: 'refund_adjustment',
    amount: amount(-grossAdjustment),
    currency_code: settlement.currency_code,
    reference: `${input.kind}:${input.paymentOperationId ?? settlement.id}:${input.now.getTime()}`,
    created_at: input.now
  }).execute();
  if (commissionShare > 0) await executor.insertInto('settlement_ledger_entries').values({
    settlement_id: settlement.id,
    entry_type: 'commission_adjustment',
    amount: amount(commissionShare),
    currency_code: settlement.currency_code,
    reference: `commission-reversal:${input.paymentOperationId ?? settlement.id}:${input.now.getTime()}`,
    created_at: input.now
  }).execute();

  if (!settlement.provider_transfer_reference) {
    const nextGross = Math.max(0, money(settlement.gross_amount) - grossAdjustment);
    const nextCommission = commissionFor(nextGross, Number(settlement.commission_bps));
    const nextNet = nextGross - nextCommission;
    await executor.updateTable('seller_settlements').set({
      gross_amount: amount(nextGross),
      commission_amount: amount(nextCommission),
      net_amount: amount(nextNet),
      status: nextGross === 0 ? 'reversed' : settlement.status,
      updated_at: input.now
    }).where('id', '=', settlement.id).execute();
    if (sellerShare > 0) await executor.insertInto('settlement_ledger_entries').values({
      settlement_id: settlement.id,
      entry_type: 'seller_payable',
      amount: amount(-sellerShare),
      currency_code: settlement.currency_code,
      reference: `payable-reduction:${input.paymentOperationId ?? settlement.id}:${input.now.getTime()}`,
      created_at: input.now
    }).execute();
    return;
  }

  if (sellerShare <= 0) return;
  const reversalId = randomUUID();
  await executor.insertInto('settlement_reversals').values({
    id: reversalId,
    settlement_id: settlement.id,
    payment_operation_id: input.paymentOperationId,
    kind: input.kind,
    amount: amount(sellerShare),
    currency_code: settlement.currency_code,
    status: 'pending',
    idempotency_key: `suqnaa-transfer-reversal-v1-${reversalId}`,
    created_at: input.now,
    updated_at: input.now
  }).execute();
}

async function unblockReadySettlements(): Promise<void> {
  await db.updateTable('seller_settlements').set({ status: 'scheduled', updated_at: new Date() })
    .where('status', '=', 'blocked')
    .where('payout_account_id', 'in', db.selectFrom('seller_payout_accounts').select('id').where('onboarding_status', '=', 'ready'))
    .execute();
  await db.updateTable('seller_settlements').set({
    payout_account_id: sql`(select id from seller_payout_accounts where seller_payout_accounts.seller_id = seller_settlements.seller_id)` as any,
    updated_at: new Date()
  }).where('payout_account_id', 'is', null)
    .where('seller_id', 'in', db.selectFrom('seller_payout_accounts').select('seller_id').where('onboarding_status', '=', 'ready'))
    .execute();
}

async function claimSettlement(configuration: SellerSettlementConfiguration) {
  return db.transaction().execute(async (trx) => {
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const row = await trx.selectFrom('seller_settlements')
      .innerJoin('seller_payout_accounts', 'seller_payout_accounts.id', 'seller_settlements.payout_account_id')
      .innerJoin('payment_intents', 'payment_intents.id', 'seller_settlements.payment_intent_id')
      .select([
        'seller_settlements.id as id', 'seller_settlements.order_id as order_id',
        'seller_settlements.net_amount as net_amount', 'seller_settlements.currency_code as currency_code',
        'seller_settlements.source_charge_reference as source_charge_reference',
        'seller_settlements.transfer_idempotency_key as transfer_idempotency_key',
        'seller_settlements.updated_at as updated_at',
        'seller_payout_accounts.provider_account_reference as provider_account_reference'
      ])
      .where('seller_payout_accounts.onboarding_status', '=', 'ready')
      .where('payment_intents.status', '=', 'released')
      .where('seller_settlements.available_at', '<=', new Date())
      .where((eb: any) => eb.or([
        eb('seller_settlements.status', 'in', ['scheduled', 'failed']),
        eb.and([eb('seller_settlements.status', '=', 'processing'), eb('seller_settlements.updated_at', '<', stale)])
      ]))
      .orderBy('seller_settlements.available_at', 'asc')
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    if (!row) return null;
    await trx.updateTable('seller_settlements').set({
      status: 'processing',
      attempt_count: sql`attempt_count + 1`,
      failure_code: null,
      updated_at: new Date()
    }).where('id', '=', row.id).execute();
    return row;
  });
}

async function processSettlement(provider: StripeConnectProvider, configuration: SellerSettlementConfiguration) {
  const work = await claimSettlement(configuration);
  if (!work) return false;
  try {
    const transfer = await provider.createTransfer({
      settlementId: String(work.id),
      orderId: String(work.order_id),
      destinationAccountId: String(work.provider_account_reference),
      sourceChargeId: String(work.source_charge_reference),
      amount: work.net_amount,
      currencyCode: String(work.currency_code),
      idempotencyKey: String(work.transfer_idempotency_key)
    });
    if (
      transfer.amount !== stripeMinorUnits(work.net_amount) ||
      transfer.currency !== String(work.currency_code).toUpperCase() ||
      transfer.destination !== String(work.provider_account_reference) ||
      transfer.sourceTransaction !== String(work.source_charge_reference)
    ) throw new SellerSettlementError('settlement_transfer_mismatch');
    const now = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('seller_settlements').set({
        status: 'transferred',
        provider_transfer_reference: transfer.id,
        transferred_at: now,
        last_reconciled_at: now,
        failure_code: null,
        updated_at: now
      }).where('id', '=', work.id).execute();
      if (money(work.net_amount) > 0) await trx.insertInto('settlement_ledger_entries').values({
        settlement_id: work.id,
        entry_type: 'seller_transfer',
        amount: amount(-money(work.net_amount)),
        currency_code: String(work.currency_code),
        reference: `transfer:${transfer.id}`,
        created_at: now
      }).execute();
    });
  } catch (error) {
    const code = error instanceof StripeProviderError ? error.safeCode : error instanceof SellerSettlementError ? error.code : 'settlement_provider_unavailable';
    await db.updateTable('seller_settlements').set({ status: 'failed', failure_code: code, updated_at: new Date() })
      .where('id', '=', work.id).execute();
  }
  return true;
}

async function claimReversal() {
  return db.transaction().execute(async (trx) => {
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const row = await trx.selectFrom('settlement_reversals')
      .innerJoin('seller_settlements', 'seller_settlements.id', 'settlement_reversals.settlement_id')
      .select([
        'settlement_reversals.id as id', 'settlement_reversals.amount as amount',
        'settlement_reversals.currency_code as currency_code', 'settlement_reversals.idempotency_key as idempotency_key',
        'seller_settlements.provider_transfer_reference as provider_transfer_reference',
        'seller_settlements.id as settlement_id'
      ])
      .where('seller_settlements.provider_transfer_reference', 'is not', null)
      .where((eb: any) => eb.or([
        eb('settlement_reversals.status', 'in', ['pending', 'failed']),
        eb.and([eb('settlement_reversals.status', '=', 'processing'), eb('settlement_reversals.updated_at', '<', stale)])
      ]))
      .orderBy('settlement_reversals.created_at', 'asc')
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    if (!row) return null;
    await trx.updateTable('settlement_reversals').set({ status: 'processing', attempt_count: sql`attempt_count + 1`, failure_code: null, updated_at: new Date() })
      .where('id', '=', row.id).execute();
    return row;
  });
}

async function processReversal(provider: StripeConnectProvider) {
  const work = await claimReversal();
  if (!work) return false;
  try {
    const result = await provider.reverseTransfer({
      reversalId: String(work.id),
      transferId: String(work.provider_transfer_reference),
      amount: work.amount,
      idempotencyKey: String(work.idempotency_key)
    });
    if (result.amount !== stripeMinorUnits(work.amount)) throw new SellerSettlementError('settlement_reversal_mismatch');
    const now = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('settlement_reversals').set({
        status: 'succeeded', provider_reversal_reference: result.id, completed_at: now, updated_at: now
      }).where('id', '=', work.id).execute();
      await trx.insertInto('settlement_ledger_entries').values({
        settlement_id: work.settlement_id,
        reversal_id: work.id,
        entry_type: 'transfer_reversal',
        amount: amount(money(work.amount)),
        currency_code: String(work.currency_code),
        reference: `transfer-reversal:${result.id}`,
        created_at: now
      }).execute();
      const total = await trx.selectFrom('settlement_reversals').select(sql<string>`coalesce(sum(amount), 0)`.as('reversed'))
        .where('settlement_id', '=', work.settlement_id).where('status', '=', 'succeeded').executeTakeFirstOrThrow();
      const settlement = await trx.selectFrom('seller_settlements').select(['net_amount']).where('id', '=', work.settlement_id).executeTakeFirstOrThrow();
      await trx.updateTable('seller_settlements').set({
        status: money(total.reversed) >= money(settlement.net_amount) ? 'reversed' : 'partially_reversed',
        last_reconciled_at: now,
        updated_at: now
      }).where('id', '=', work.settlement_id).execute();
    });
  } catch (error) {
    const code = error instanceof StripeProviderError ? error.safeCode : error instanceof SellerSettlementError ? error.code : 'settlement_provider_unavailable';
    await db.updateTable('settlement_reversals').set({ status: 'failed', failure_code: code, updated_at: new Date() })
      .where('id', '=', work.id).execute();
  }
  return true;
}

export async function runSellerSettlementBatch(input?: { limit?: number; provider?: StripeConnectProvider }) {
  const configuration = sellerSettlementConfigurationFromEnvironment();
  if (!configuration.enabled) return { processedTransfers: 0, processedReversals: 0 };
  const provider = input?.provider ?? new StripeConnectProvider(
    paymentCollectionConfigurationFromEnvironment(), configuration
  );
  await unblockReadySettlements();
  const limit = Math.min(input?.limit ?? configuration.workerBatchSize, configuration.workerBatchSize);
  let processedReversals = 0;
  let processedTransfers = 0;
  for (let index = 0; index < limit; index += 1) {
    if (!await processReversal(provider)) break;
    processedReversals += 1;
  }
  for (let index = 0; index < limit; index += 1) {
    if (!await processSettlement(provider, configuration)) break;
    processedTransfers += 1;
  }
  return { processedTransfers, processedReversals };
}

export async function applyStripeConnectEvent(event: StripeConnectEvent) {
  return db.transaction().execute(async (trx) => {
    const account = await trx.selectFrom('seller_payout_accounts').selectAll()
      .where('provider_account_reference', '=', event.account).forUpdate().executeTakeFirst();
    if (!account) throw new SellerSettlementError('payout_account_missing', 404);
    const existing = await trx.selectFrom('seller_payout_events').select(['id'])
      .where('provider_event_id', '=', event.id).executeTakeFirst();
    if (existing) return { duplicate: true, sellerId: String(account.seller_id) };
    const occurredAt = new Date(event.created * 1000);

    if (event.type === 'account.updated') {
      const object = event.data.object;
      const due = new Set([
        ...(object.requirements?.currently_due ?? []),
        ...(object.requirements?.past_due ?? []),
        ...(object.requirements?.pending_verification ?? [])
      ]).size;
      const state: StripeConnectedAccountState = {
        id: object.id,
        country: object.country.toUpperCase(),
        defaultCurrency: object.default_currency.toUpperCase(),
        detailsSubmitted: object.details_submitted,
        transfersEnabled: object.capabilities?.transfers === 'active',
        payoutsEnabled: object.payouts_enabled,
        requirementsDue: due,
        disabledReason: object.requirements?.disabled_reason ?? null
      };
      await trx.updateTable('seller_payout_accounts').set({
        country_code: state.country,
        default_currency: state.defaultCurrency,
        onboarding_status: accountStatus(state),
        transfers_enabled: state.transfersEnabled,
        payouts_enabled: state.payoutsEnabled,
        details_submitted: state.detailsSubmitted,
        requirements_due: state.requirementsDue,
        disabled_reason: state.disabledReason,
        last_provider_sync_at: occurredAt,
        updated_at: new Date()
      }).where('id', '=', account.id).execute();
      await trx.insertInto('seller_payout_events').values({
        payout_account_id: account.id,
        provider_event_id: event.id,
        provider_payout_reference: null,
        event_type: event.type,
        amount: null,
        currency_code: null,
        status: accountStatus(state),
        failure_code: state.disabledReason,
        occurred_at: occurredAt
      }).execute();
    } else {
      const payout = event.data.object;
      await trx.insertInto('seller_payout_events').values({
        payout_account_id: account.id,
        provider_event_id: event.id,
        provider_payout_reference: payout.id,
        event_type: event.type,
        amount: amount(payout.amount / 100),
        currency_code: payout.currency.toUpperCase(),
        status: payout.status,
        failure_code: payout.failure_code ?? null,
        occurred_at: occurredAt
      }).execute();
      if (event.type === 'payout.failed') {
        await trx.updateTable('seller_payout_accounts').set({
          onboarding_status: 'restricted',
          payouts_enabled: false,
          disabled_reason: payout.failure_code ?? 'payout_failed',
          updated_at: new Date()
        }).where('id', '=', account.id).execute();
      }
    }
    return { duplicate: false, sellerId: String(account.seller_id) };
  });
}

export async function listSettlementOperations(input: { status?: string; sellerId?: string; limit?: number }) {
  let query = db.selectFrom('seller_settlements')
    .leftJoin('seller_payout_accounts', 'seller_payout_accounts.id', 'seller_settlements.payout_account_id')
    .select([
      'seller_settlements.id', 'seller_settlements.order_id', 'seller_settlements.seller_id',
      'seller_settlements.gross_amount', 'seller_settlements.commission_amount', 'seller_settlements.net_amount',
      'seller_settlements.currency_code', 'seller_settlements.status', 'seller_settlements.available_at',
      'seller_settlements.provider_transfer_reference', 'seller_settlements.failure_code', 'seller_settlements.attempt_count',
      'seller_payout_accounts.onboarding_status as payout_account_status'
    ])
    .orderBy('seller_settlements.created_at', 'desc');
  if (input.status) query = query.where('seller_settlements.status', '=', input.status);
  if (input.sellerId) query = query.where('seller_settlements.seller_id', '=', input.sellerId);
  return query.limit(Math.min(input.limit ?? 100, 200)).execute();
}
