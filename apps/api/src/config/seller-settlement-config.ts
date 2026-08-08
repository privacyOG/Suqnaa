export type SellerSettlementPayoutInterval = 'daily' | 'weekly' | 'monthly';

export interface SellerSettlementConfiguration {
  enabled: boolean;
  commissionBps: number;
  settlementDelayDays: number;
  payoutInterval: SellerSettlementPayoutInterval;
  payoutAnchor: string;
  workerBatchSize: number;
  workerIntervalMs: number;
  connectWebhookSecret: string;
}

const weekdays = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);

function parseInteger(value: string | undefined, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function resolveSellerSettlementConfiguration(input: {
  enabled?: string;
  commissionBps?: string;
  settlementDelayDays?: string;
  payoutInterval?: string;
  payoutAnchor?: string;
  workerBatchSize?: string;
  workerIntervalMs?: string;
  connectWebhookSecret?: string;
}): SellerSettlementConfiguration {
  const enabled = input.enabled === 'true';
  const commissionBps = parseInteger(input.commissionBps ?? '0', 'SELLER_SETTLEMENT_COMMISSION_BPS', 0, 5000);
  const settlementDelayDays = parseInteger(input.settlementDelayDays ?? '0', 'SELLER_SETTLEMENT_DELAY_DAYS', 0, 31);
  const workerBatchSize = parseInteger(input.workerBatchSize ?? '50', 'SELLER_SETTLEMENT_WORKER_BATCH_SIZE', 1, 500);
  const workerIntervalMs = parseInteger(input.workerIntervalMs ?? '15000', 'SELLER_SETTLEMENT_WORKER_INTERVAL_MS', 1000, 300000);
  const payoutInterval = (input.payoutInterval ?? 'weekly').trim().toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(payoutInterval)) {
    throw new Error('SELLER_SETTLEMENT_PAYOUT_INTERVAL must be daily, weekly, or monthly');
  }

  const rawAnchor = (input.payoutAnchor ?? (payoutInterval === 'monthly' ? '1' : 'monday')).trim().toLowerCase();
  let payoutAnchor = rawAnchor;
  if (payoutInterval === 'daily') {
    payoutAnchor = 'daily';
  } else if (payoutInterval === 'weekly') {
    if (!weekdays.has(rawAnchor)) throw new Error('Weekly payout anchor must be a weekday Monday-Friday');
  } else {
    const day = parseInteger(rawAnchor, 'SELLER_SETTLEMENT_PAYOUT_ANCHOR', 1, 31);
    payoutAnchor = String(day);
  }

  const connectWebhookSecret = (input.connectWebhookSecret ?? '').trim();
  if (enabled && !/^whsec_[A-Za-z0-9_]{12,}$/.test(connectWebhookSecret)) {
    throw new Error('Enabled seller settlement requires STRIPE_CONNECT_WEBHOOK_SECRET');
  }

  return {
    enabled,
    commissionBps,
    settlementDelayDays,
    payoutInterval: payoutInterval as SellerSettlementPayoutInterval,
    payoutAnchor,
    workerBatchSize,
    workerIntervalMs,
    connectWebhookSecret
  };
}

export function sellerSettlementConfigurationFromEnvironment(): SellerSettlementConfiguration {
  return resolveSellerSettlementConfiguration({
    enabled: process.env.SELLER_SETTLEMENT_ENABLED,
    commissionBps: process.env.SELLER_SETTLEMENT_COMMISSION_BPS,
    settlementDelayDays: process.env.SELLER_SETTLEMENT_DELAY_DAYS,
    payoutInterval: process.env.SELLER_SETTLEMENT_PAYOUT_INTERVAL,
    payoutAnchor: process.env.SELLER_SETTLEMENT_PAYOUT_ANCHOR,
    workerBatchSize: process.env.SELLER_SETTLEMENT_WORKER_BATCH_SIZE,
    workerIntervalMs: process.env.SELLER_SETTLEMENT_WORKER_INTERVAL_MS,
    connectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  });
}
