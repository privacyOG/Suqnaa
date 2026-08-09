import { createHash } from 'node:crypto';
import { db } from '../db/index.js';

export type RiskCategory =
  | 'account_abuse'
  | 'offer_payment_fraud'
  | 'account_takeover'
  | 'velocity_anomaly'
  | 'duplicate_identity'
  | 'suspicious_seller';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskMetric = 'event_count' | 'distinct_accounts' | 'amount';

export interface RiskRuleDefinition {
  id: string;
  ruleKey: string;
  category: RiskCategory;
  severity: RiskSeverity;
  score: number;
  windowSeconds: number | null;
  thresholdCount: number | null;
  thresholdAmount: number | null;
  configuration: Record<string, unknown>;
}

export interface MarketplaceRiskEvent {
  eventType: string;
  sourceEventId?: string | null;
  userId?: string | null;
  listingId?: string | null;
  offerId?: string | null;
  orderId?: string | null;
  paymentIntentId?: string | null;
  reportId?: string | null;
  eventCount?: number;
  distinctAccounts?: number;
  amount?: number;
  summary?: string;
  evidence?: Record<string, unknown>;
}

export interface RiskRuleMatch {
  rule: RiskRuleDefinition;
  metric: RiskMetric;
  observedValue: number;
  thresholdValue: number;
}

function configuredEventTypes(rule: RiskRuleDefinition): string[] {
  const value = rule.configuration.eventTypes;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function configuredMetric(rule: RiskRuleDefinition): RiskMetric {
  const value = rule.configuration.metric;
  return value === 'distinct_accounts' || value === 'amount' ? value : 'event_count';
}

export function evaluateRiskRule(
  rule: RiskRuleDefinition,
  event: MarketplaceRiskEvent
): RiskRuleMatch | null {
  const eventTypes = configuredEventTypes(rule);
  if (!eventTypes.includes(event.eventType)) return null;

  const metric = configuredMetric(rule);
  const observedValue = metric === 'distinct_accounts'
    ? Math.max(0, event.distinctAccounts ?? 0)
    : metric === 'amount'
      ? Math.max(0, event.amount ?? 0)
      : Math.max(0, event.eventCount ?? 1);

  const thresholdValue = metric === 'amount'
    ? Number(rule.thresholdAmount ?? 0)
    : Number(rule.thresholdCount ?? 1);

  if (observedValue < thresholdValue) return null;
  if (rule.thresholdAmount !== null && Math.max(0, event.amount ?? 0) < rule.thresholdAmount) return null;

  return { rule, metric, observedValue, thresholdValue };
}

function signalFingerprint(ruleKey: string, event: MarketplaceRiskEvent): string {
  const subject = [
    event.userId ?? '',
    event.listingId ?? '',
    event.offerId ?? '',
    event.orderId ?? '',
    event.paymentIntentId ?? '',
    event.reportId ?? ''
  ].join('|');
  return createHash('sha256').update(`${ruleKey}|${event.eventType}|${subject}`).digest('hex');
}

function safeEvidence(event: MarketplaceRiskEvent, match: RiskRuleMatch): Record<string, unknown> {
  return {
    eventType: event.eventType,
    metric: match.metric,
    observedValue: match.observedValue,
    thresholdValue: match.thresholdValue,
    ...(typeof event.amount === 'number' ? { amount: event.amount } : {}),
    ...(event.evidence ?? {})
  };
}

export async function loadActiveRiskRules(): Promise<RiskRuleDefinition[]> {
  const rows = await db.selectFrom('risk_rules')
    .select([
      'id', 'rule_key', 'category', 'severity', 'score', 'window_seconds',
      'threshold_count', 'threshold_amount', 'configuration'
    ])
    .where('is_active', '=', true)
    .orderBy('score', 'desc')
    .orderBy('rule_key', 'asc')
    .execute();

  return rows.map((row) => ({
    id: String(row.id),
    ruleKey: String(row.rule_key),
    category: String(row.category) as RiskCategory,
    severity: String(row.severity) as RiskSeverity,
    score: Number(row.score),
    windowSeconds: row.window_seconds === null ? null : Number(row.window_seconds),
    thresholdCount: row.threshold_count === null ? null : Number(row.threshold_count),
    thresholdAmount: row.threshold_amount === null ? null : Number(row.threshold_amount),
    configuration: typeof row.configuration === 'object' && row.configuration !== null
      ? row.configuration as Record<string, unknown>
      : {}
  }));
}

async function persistRiskSignal(match: RiskRuleMatch, event: MarketplaceRiskEvent) {
  const now = new Date();
  const fingerprint = signalFingerprint(match.rule.ruleKey, event);

  if (event.sourceEventId) {
    const existingSource = await db.selectFrom('risk_signals')
      .select(['id', 'status', 'occurrence_count'])
      .where('rule_key', '=', match.rule.ruleKey)
      .where('source_event_type', '=', event.eventType)
      .where('source_event_id', '=', event.sourceEventId)
      .executeTakeFirst();
    if (existingSource) {
      return {
        signalId: String(existingSource.id),
        status: String(existingSource.status),
        duplicateSourceEvent: true,
        aggregated: false
      };
    }
  }

  const existingOpen = await db.selectFrom('risk_signals')
    .select(['id', 'occurrence_count'])
    .where('rule_key', '=', match.rule.ruleKey)
    .where('fingerprint', '=', fingerprint)
    .where('status', '=', 'open')
    .executeTakeFirst();

  if (existingOpen) {
    const updated = await db.updateTable('risk_signals').set({
      last_observed_at: now,
      occurrence_count: Number(existingOpen.occurrence_count) + 1,
      score: match.rule.score,
      severity: match.rule.severity,
      summary: event.summary ?? `Risk rule matched: ${match.rule.ruleKey}`,
      evidence: safeEvidence(event, match),
      updated_at: now
    }).where('id', '=', existingOpen.id)
      .where('status', '=', 'open')
      .returning(['id', 'occurrence_count'])
      .executeTakeFirst();
    if (updated) {
      return {
        signalId: String(updated.id),
        status: 'open',
        duplicateSourceEvent: false,
        aggregated: true,
        occurrenceCount: Number(updated.occurrence_count)
      };
    }
  }

  const inserted = await db.insertInto('risk_signals').values({
    rule_id: match.rule.id,
    rule_key: match.rule.ruleKey,
    category: match.rule.category,
    severity: match.rule.severity,
    score: match.rule.score,
    status: 'open',
    user_id: event.userId ?? null,
    listing_id: event.listingId ?? null,
    offer_id: event.offerId ?? null,
    order_id: event.orderId ?? null,
    payment_intent_id: event.paymentIntentId ?? null,
    report_id: event.reportId ?? null,
    source_event_type: event.eventType,
    source_event_id: event.sourceEventId ?? null,
    fingerprint,
    summary: event.summary ?? `Risk rule matched: ${match.rule.ruleKey}`,
    evidence: safeEvidence(event, match),
    detected_at: now,
    last_observed_at: now,
    occurrence_count: 1,
    created_at: now,
    updated_at: now
  }).returning(['id']).executeTakeFirstOrThrow();

  return {
    signalId: String(inserted.id),
    status: 'open',
    duplicateSourceEvent: false,
    aggregated: false,
    occurrenceCount: 1
  };
}

export async function evaluateMarketplaceRiskEvent(event: MarketplaceRiskEvent) {
  const rules = await loadActiveRiskRules();
  const matches = rules
    .map((rule) => evaluateRiskRule(rule, event))
    .filter((match): match is RiskRuleMatch => Boolean(match));

  const signals = [];
  for (const match of matches) {
    signals.push({
      ruleKey: match.rule.ruleKey,
      category: match.rule.category,
      severity: match.rule.severity,
      score: match.rule.score,
      ...(await persistRiskSignal(match, event))
    });
  }

  return { matched: matches.length > 0, signals };
}

export async function observeHashedRiskIdentity(input: {
  identityType: 'verification_subject' | 'payout_account' | 'payment_instrument' | 'device' | 'network';
  identityHash: string;
  userId: string;
  source: string;
  metadata?: Record<string, unknown>;
  sourceEventId?: string;
}) {
  if (!/^[0-9a-fA-F]{32,128}$/.test(input.identityHash)) {
    throw new Error('risk_identity_hash_required');
  }

  const normalizedHash = input.identityHash.toLowerCase();
  const now = new Date();
  const existing = await db.selectFrom('risk_identity_links')
    .select(['id'])
    .where('identity_type', '=', input.identityType)
    .where('identity_hash', '=', normalizedHash)
    .where('user_id', '=', input.userId)
    .executeTakeFirst();

  if (existing) {
    await db.updateTable('risk_identity_links').set({
      last_seen_at: now,
      source: input.source,
      metadata: input.metadata ?? {},
    }).where('id', '=', existing.id).execute();
  } else {
    await db.insertInto('risk_identity_links').values({
      identity_type: input.identityType,
      identity_hash: normalizedHash,
      user_id: input.userId,
      first_seen_at: now,
      last_seen_at: now,
      source: input.source,
      metadata: input.metadata ?? {}
    }).execute();
  }

  const linkedAccounts = await db.selectFrom('risk_identity_links')
    .select(['user_id'])
    .where('identity_type', '=', input.identityType)
    .where('identity_hash', '=', normalizedHash)
    .execute();
  const distinctAccounts = new Set(linkedAccounts.map((row) => String(row.user_id))).size;

  return evaluateMarketplaceRiskEvent({
    eventType: 'identity.link_observed',
    sourceEventId: input.sourceEventId ?? `${input.identityType}:${normalizedHash}:${input.userId}`,
    userId: input.userId,
    distinctAccounts,
    summary: `Protected ${input.identityType} correlation observed across ${distinctAccounts} account(s).`,
    evidence: { identityType: input.identityType, distinctAccounts }
  });
}
