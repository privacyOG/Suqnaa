import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { requireOperationsUser, type OperationsRequest } from '../auth/require-operations-user.js';
import { db } from '../db/index.js';
import {
  ModerationPolicyError,
  addModeratorNote,
  applyAccountModerationAction,
  applyListingModerationAction,
  decideModerationAppeal,
  openModerationAppeal,
  reconcileModerationEvidenceRetention
} from '../moderation/moderation-policy-service.js';

const uuidParams = z.object({ id: z.string().uuid() });
const listingActionBody = z.object({
  action: z.enum(['approve', 'takedown']),
  reasonCode: z.string().trim().regex(/^[a-z][a-z0-9_.-]{2,79}$/),
  reason: z.string().trim().min(8).max(4000),
  reportId: z.string().uuid().nullable().optional()
});
const accountActionBody = z.object({
  action: z.enum(['suspend', 'close']),
  reasonCode: z.string().trim().regex(/^[a-z][a-z0-9_.-]{2,79}$/),
  reason: z.string().trim().min(8).max(4000),
  reportId: z.string().uuid().nullable().optional()
});
const noteBody = z.object({ note: z.string().trim().min(1).max(4000) });
const appealBody = z.object({ reason: z.string().trim().min(8).max(4000) });
const appealDecisionBody = z.object({
  decision: z.enum(['uphold', 'overturn', 'dismiss']),
  note: z.string().trim().min(8).max(4000)
});
const policyRuleBody = z.object({
  scope: z.enum(['category', 'listing_text']),
  categoryId: z.string().uuid().nullable().optional(),
  pattern: z.string().trim().min(2).max(200).nullable().optional(),
  action: z.enum(['block', 'manual_review']),
  reasonCode: z.string().trim().regex(/^[a-z][a-z0-9_.-]{2,79}$/),
  note: z.string().trim().max(2000).nullable().optional()
}).superRefine((value, context) => {
  if (value.scope === 'category' && (!value.categoryId || value.pattern)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Category rules require categoryId only' });
  }
  if (value.scope === 'listing_text' && (!value.pattern || value.categoryId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Listing-text rules require pattern only' });
  }
});
const ruleStatusBody = z.object({ active: z.boolean() });
const actionListQuery = z.object({
  status: z.enum(['active', 'reversed', 'superseded']).optional(),
  actionType: z.enum([
    'listing_review_pending', 'listing_approve', 'listing_takedown',
    'account_suspend', 'account_close', 'no_action'
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});
const appealListQuery = z.object({
  status: z.enum(['open', 'upheld', 'overturned', 'dismissed']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

function policyError(reply: any, error: unknown) {
  if (error instanceof ModerationPolicyError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  throw error;
}

export async function moderationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/moderation/policy-rules', { preHandler: requireOperationsUser }, async (_request, reply) => {
    const rows = await db.selectFrom('moderation_policy_rules')
      .leftJoin('categories', 'categories.id', 'moderation_policy_rules.category_id')
      .select([
        'moderation_policy_rules.id as id', 'moderation_policy_rules.scope as scope',
        'moderation_policy_rules.category_id as category_id', 'categories.slug as category_slug',
        'moderation_policy_rules.pattern as pattern', 'moderation_policy_rules.action as action',
        'moderation_policy_rules.reason_code as reason_code', 'moderation_policy_rules.note as note',
        'moderation_policy_rules.is_active as is_active', 'moderation_policy_rules.updated_at as updated_at'
      ])
      .orderBy('moderation_policy_rules.updated_at', 'desc')
      .limit(250)
      .execute();
    return reply.send({ rules: rows.map((row) => ({
      id: row.id, scope: row.scope, categoryId: row.category_id, categorySlug: row.category_slug,
      pattern: row.pattern, action: row.action, reasonCode: row.reason_code, note: row.note,
      active: Boolean(row.is_active), updatedAt: row.updated_at
    })) });
  });

  app.post('/operations/moderation/policy-rules', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const body = policyRuleBody.parse(request.body);
    const now = new Date();
    const row = await db.insertInto('moderation_policy_rules').values({
      scope: body.scope,
      category_id: body.scope === 'category' ? body.categoryId! : null,
      pattern: body.scope === 'listing_text' ? body.pattern! : null,
      action: body.action,
      reason_code: body.reasonCode,
      note: body.note ?? null,
      is_active: true,
      created_by: auth.operationsUserId,
      updated_by: auth.operationsUserId,
      created_at: now,
      updated_at: now
    }).returning(['id', 'created_at']).executeTakeFirstOrThrow();
    await db.insertInto('audit_logs').values({
      actor_user_id: auth.operationsUserId,
      action: 'moderation.policy_rule.create',
      entity_type: 'moderation_policy_rule',
      entity_id: row.id,
      metadata: { scope: body.scope, action: body.action, reasonCode: body.reasonCode },
      created_at: now
    }).execute();
    return reply.code(201).send({ rule: { id: row.id, createdAt: row.created_at } });
  });

  app.post('/operations/moderation/policy-rules/:id/status', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = uuidParams.parse(request.params);
    const body = ruleStatusBody.parse(request.body);
    const now = new Date();
    const row = await db.updateTable('moderation_policy_rules').set({
      is_active: body.active, updated_by: auth.operationsUserId, updated_at: now
    }).where('id', '=', params.id).returning(['id', 'is_active']).executeTakeFirst();
    if (!row) return reply.code(404).send({ error: 'Moderation policy rule not found' });
    await db.insertInto('audit_logs').values({
      actor_user_id: auth.operationsUserId,
      action: 'moderation.policy_rule.status',
      entity_type: 'moderation_policy_rule',
      entity_id: row.id,
      metadata: { active: Boolean(row.is_active) },
      created_at: now
    }).execute();
    return reply.send({ rule: { id: row.id, active: Boolean(row.is_active) } });
  });

  app.get('/operations/moderation/actions', { preHandler: requireOperationsUser }, async (request, reply) => {
    const query = actionListQuery.parse(request.query);
    let requestQuery = db.selectFrom('moderation_actions')
      .select([
        'id', 'report_id', 'listing_id', 'user_id', 'action_type', 'source', 'reason_code', 'reason',
        'status', 'acted_by', 'reversed_by', 'reversed_at', 'reversal_reason', 'metadata',
        'evidence_retain_until', 'evidence_purged_at', 'created_at', 'updated_at'
      ]);
    if (query.status) requestQuery = requestQuery.where('status', '=', query.status);
    if (query.actionType) requestQuery = requestQuery.where('action_type', '=', query.actionType);
    const rows = await requestQuery.orderBy('created_at', 'desc').limit(query.limit).execute();
    return reply.send({ actions: rows.map((row) => ({
      id: row.id, reportId: row.report_id, listingId: row.listing_id, userId: row.user_id,
      actionType: row.action_type, source: row.source, reasonCode: row.reason_code, reason: row.reason,
      status: row.status, actedBy: row.acted_by, reversedBy: row.reversed_by, reversedAt: row.reversed_at,
      reversalReason: row.reversal_reason, metadata: row.metadata,
      evidenceRetainUntil: row.evidence_retain_until, evidencePurgedAt: row.evidence_purged_at,
      createdAt: row.created_at, updatedAt: row.updated_at
    })) });
  });

  app.post('/operations/moderation/listings/:id/action', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = uuidParams.parse(request.params);
    const body = listingActionBody.parse(request.body);
    try {
      const result = await applyListingModerationAction({
        listingId: params.id, actorId: auth.operationsUserId, action: body.action,
        reasonCode: body.reasonCode, reason: body.reason, reportId: body.reportId
      });
      return reply.send(result);
    } catch (error) { return policyError(reply, error); }
  });

  app.post('/operations/moderation/accounts/:id/action', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = uuidParams.parse(request.params);
    const body = accountActionBody.parse(request.body);
    try {
      const result = await applyAccountModerationAction({
        userId: params.id, actorId: auth.operationsUserId, action: body.action,
        reasonCode: body.reasonCode, reason: body.reason, reportId: body.reportId
      });
      return reply.send(result);
    } catch (error) { return policyError(reply, error); }
  });

  app.post('/operations/moderation/actions/:id/notes', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = uuidParams.parse(request.params);
    const body = noteBody.parse(request.body);
    try {
      return reply.code(201).send({ note: await addModeratorNote({ actionId: params.id, authorUserId: auth.operationsUserId, note: body.note }) });
    } catch (error) { return policyError(reply, error); }
  });

  app.get('/operations/moderation/appeals', { preHandler: requireOperationsUser }, async (request, reply) => {
    const query = appealListQuery.parse(request.query);
    let appealQuery = db.selectFrom('moderation_appeals')
      .innerJoin('moderation_actions', 'moderation_actions.id', 'moderation_appeals.moderation_action_id')
      .select([
        'moderation_appeals.id as id', 'moderation_appeals.moderation_action_id as action_id',
        'moderation_appeals.appellant_user_id as appellant_user_id', 'moderation_appeals.status as status',
        'moderation_appeals.reason as reason', 'moderation_appeals.reviewed_by as reviewed_by',
        'moderation_appeals.decision as decision', 'moderation_appeals.decision_note as decision_note',
        'moderation_appeals.opened_at as opened_at', 'moderation_appeals.decided_at as decided_at',
        'moderation_actions.action_type as action_type', 'moderation_actions.listing_id as listing_id',
        'moderation_actions.user_id as user_id'
      ]);
    if (query.status) appealQuery = appealQuery.where('moderation_appeals.status', '=', query.status);
    const rows = await appealQuery.orderBy('moderation_appeals.opened_at', 'desc').limit(query.limit).execute();
    return reply.send({ appeals: rows.map((row) => ({
      id: row.id, moderationActionId: row.action_id, appellantUserId: row.appellant_user_id,
      status: row.status, reason: row.reason, reviewedBy: row.reviewed_by, decision: row.decision,
      decisionNote: row.decision_note, openedAt: row.opened_at, decidedAt: row.decided_at,
      actionType: row.action_type, listingId: row.listing_id, userId: row.user_id
    })) });
  });

  app.post('/operations/moderation/appeals/:id/decision', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = uuidParams.parse(request.params);
    const body = appealDecisionBody.parse(request.body);
    try {
      return reply.send(await decideModerationAppeal({ appealId: params.id, reviewerUserId: auth.operationsUserId, decision: body.decision, note: body.note }));
    } catch (error) { return policyError(reply, error); }
  });

  app.post('/operations/moderation/reconcile-retention', { preHandler: requireOperationsUser }, async (_request, reply) => {
    return reply.send(await reconcileModerationEvidenceRetention());
  });

  app.post('/market/moderation/actions/:id/appeal', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = uuidParams.parse(request.params);
    const body = appealBody.parse(request.body);
    try {
      return reply.code(201).send({ appeal: await openModerationAppeal({ actionId: params.id, appellantUserId: auth.user.sub, reason: body.reason }) });
    } catch (error) { return policyError(reply, error); }
  });

  app.get('/market/moderation/appeals', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const rows = await db.selectFrom('moderation_appeals')
      .innerJoin('moderation_actions', 'moderation_actions.id', 'moderation_appeals.moderation_action_id')
      .select([
        'moderation_appeals.id as id', 'moderation_appeals.moderation_action_id as action_id',
        'moderation_appeals.status as status', 'moderation_appeals.reason as reason',
        'moderation_appeals.decision as decision', 'moderation_appeals.decision_note as decision_note',
        'moderation_appeals.opened_at as opened_at', 'moderation_appeals.decided_at as decided_at',
        'moderation_actions.action_type as action_type', 'moderation_actions.listing_id as listing_id'
      ])
      .where('moderation_appeals.appellant_user_id', '=', auth.user.sub)
      .orderBy('moderation_appeals.opened_at', 'desc')
      .limit(100)
      .execute();
    return reply.send({ appeals: rows.map((row) => ({
      id: row.id, moderationActionId: row.action_id, status: row.status, reason: row.reason,
      decision: row.decision, decisionNote: row.decision_note, openedAt: row.opened_at,
      decidedAt: row.decided_at, actionType: row.action_type, listingId: row.listing_id
    })) });
  });
}
