import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireOperationsUser, type OperationsRequest } from '../auth/require-operations-user.js';
import { db } from '../db/index.js';

const riskCategory = z.enum([
  'account_abuse',
  'offer_payment_fraud',
  'account_takeover',
  'velocity_anomaly',
  'duplicate_identity',
  'suspicious_seller'
]);
const riskSeverity = z.enum(['low', 'medium', 'high', 'critical']);
const signalStatus = z.enum(['open', 'reviewed', 'dismissed', 'escalated']);
const disposition = z.enum(['confirmed', 'false_positive', 'monitor', 'escalated']);

const listSignalsQuery = z.object({
  status: signalStatus.optional(),
  category: riskCategory.optional(),
  severity: riskSeverity.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const createRuleBody = z.object({
  ruleKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),
  category: riskCategory,
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(3).max(2000),
  severity: riskSeverity,
  score: z.number().int().min(1).max(100),
  windowSeconds: z.number().int().min(60).max(2592000).nullable().optional(),
  thresholdCount: z.number().int().min(1).max(1000000).nullable().optional(),
  thresholdAmount: z.number().nonnegative().nullable().optional(),
  eventTypes: z.array(z.string().trim().min(3).max(120)).min(1).max(20),
  metric: z.enum(['event_count', 'distinct_accounts', 'amount']).default('event_count')
});

const ruleStatusBody = z.object({ active: z.boolean() });
const ruleParams = z.object({ ruleId: z.string().uuid() });
const signalParams = z.object({ signalId: z.string().uuid() });
const reviewBody = z.object({
  disposition,
  note: z.string().trim().max(4000).nullable().optional()
});

function riskRuleResponse(row: Record<string, any>) {
  return {
    id: row.id,
    ruleKey: row.rule_key,
    category: row.category,
    title: row.title,
    description: row.description,
    severity: row.severity,
    score: Number(row.score),
    windowSeconds: row.window_seconds === null ? null : Number(row.window_seconds),
    thresholdCount: row.threshold_count === null ? null : Number(row.threshold_count),
    thresholdAmount: row.threshold_amount === null ? null : Number(row.threshold_amount),
    configuration: row.configuration,
    source: row.source,
    active: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function riskSignalResponse(row: Record<string, any>) {
  return {
    id: row.id,
    ruleKey: row.rule_key,
    category: row.category,
    severity: row.severity,
    score: Number(row.score),
    status: row.status,
    userId: row.user_id,
    listingId: row.listing_id,
    offerId: row.offer_id,
    orderId: row.order_id,
    paymentIntentId: row.payment_intent_id,
    reportId: row.report_id,
    sourceEventType: row.source_event_type,
    summary: row.summary,
    evidence: row.evidence,
    detectedAt: row.detected_at,
    lastObservedAt: row.last_observed_at,
    occurrenceCount: Number(row.occurrence_count),
    reviewedBy: row.reviewed_by,
    reviewDisposition: row.review_disposition,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at
  };
}

export async function operationsRiskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/risk/rules', { preHandler: requireOperationsUser }, async (_request, reply) => {
    const rows = await db.selectFrom('risk_rules')
      .selectAll()
      .orderBy('is_active', 'desc')
      .orderBy('score', 'desc')
      .orderBy('rule_key', 'asc')
      .execute();
    return reply.send({ rules: rows.map(riskRuleResponse) });
  });

  app.post('/operations/risk/rules', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const body = createRuleBody.parse(request.body);
    const now = new Date();
    const inserted = await db.insertInto('risk_rules').values({
      rule_key: body.ruleKey,
      category: body.category,
      title: body.title,
      description: body.description,
      severity: body.severity,
      score: body.score,
      window_seconds: body.windowSeconds ?? null,
      threshold_count: body.thresholdCount ?? null,
      threshold_amount: body.thresholdAmount ?? null,
      configuration: { eventTypes: [...new Set(body.eventTypes)], metric: body.metric },
      source: 'operator',
      is_active: true,
      created_by: auth.operationsUserId,
      updated_by: auth.operationsUserId,
      created_at: now,
      updated_at: now
    }).returningAll().executeTakeFirstOrThrow();

    await db.insertInto('audit_logs').values({
      actor_user_id: auth.operationsUserId,
      action: 'risk.rule_create',
      entity_type: 'risk_rule',
      entity_id: inserted.id,
      metadata: { ruleKey: inserted.rule_key, category: inserted.category },
      created_at: now
    }).execute();

    return reply.code(201).send({ rule: riskRuleResponse(inserted) });
  });

  app.post('/operations/risk/rules/:ruleId/status', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const { ruleId } = ruleParams.parse(request.params);
    const body = ruleStatusBody.parse(request.body);
    const now = new Date();
    const updated = await db.updateTable('risk_rules').set({
      is_active: body.active,
      updated_by: auth.operationsUserId,
      updated_at: now
    }).where('id', '=', ruleId).returningAll().executeTakeFirst();
    if (!updated) return reply.code(404).send({ error: 'Risk rule not found' });

    await db.insertInto('audit_logs').values({
      actor_user_id: auth.operationsUserId,
      action: body.active ? 'risk.rule_enable' : 'risk.rule_disable',
      entity_type: 'risk_rule',
      entity_id: ruleId,
      metadata: { ruleKey: updated.rule_key },
      created_at: now
    }).execute();
    return reply.send({ rule: riskRuleResponse(updated) });
  });

  app.get('/operations/risk/signals', { preHandler: requireOperationsUser }, async (request, reply) => {
    const query = listSignalsQuery.parse(request.query);
    let builder = db.selectFrom('risk_signals').selectAll();
    if (query.status) builder = builder.where('status', '=', query.status);
    if (query.category) builder = builder.where('category', '=', query.category);
    if (query.severity) builder = builder.where('severity', '=', query.severity);
    const rows = await builder.orderBy('score', 'desc').orderBy('last_observed_at', 'desc').limit(query.limit).execute();
    return reply.send({ signals: rows.map(riskSignalResponse) });
  });

  app.post('/operations/risk/signals/:signalId/review', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const { signalId } = signalParams.parse(request.params);
    const body = reviewBody.parse(request.body);
    const now = new Date();
    const nextStatus = body.disposition === 'false_positive'
      ? 'dismissed'
      : body.disposition === 'escalated'
        ? 'escalated'
        : 'reviewed';

    const updated = await db.updateTable('risk_signals').set({
      status: nextStatus,
      reviewed_by: auth.operationsUserId,
      review_disposition: body.disposition,
      review_note: body.note ?? null,
      reviewed_at: now,
      updated_at: now
    }).where('id', '=', signalId).where('status', '=', 'open').returningAll().executeTakeFirst();
    if (!updated) return reply.code(409).send({ error: 'Risk signal is not open or does not exist' });

    await db.insertInto('audit_logs').values({
      actor_user_id: auth.operationsUserId,
      action: 'risk.signal_review',
      entity_type: 'risk_signal',
      entity_id: signalId,
      metadata: { disposition: body.disposition, ruleKey: updated.rule_key },
      created_at: now
    }).execute();
    return reply.send({ signal: riskSignalResponse(updated) });
  });

  app.post('/operations/risk/reconcile-observations', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const removed = await db.deleteFrom('risk_event_observations')
      .where('observed_at', '<', cutoff)
      .returning(['id'])
      .execute();
    const now = new Date();
    await db.insertInto('audit_logs').values({
      actor_user_id: auth.operationsUserId,
      action: 'risk.observation_retention_reconcile',
      entity_type: 'risk_observation',
      entity_id: null,
      metadata: { removed: removed.length, cutoff: cutoff.toISOString() },
      created_at: now
    }).execute();
    return reply.send({ removed: removed.length, cutoff: cutoff.toISOString() });
  });
}
