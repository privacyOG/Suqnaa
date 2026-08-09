import type { FastifyReply, FastifyRequest } from 'fastify';
import { readAdministrativePermissions } from '../auth/require-permission.js';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';

const dashboardFraudPath = /^\/v1\/operations\/dashboard\/fraud(?:\?.*)?$/;

export async function serveRiskFraudDashboard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.method !== 'GET' || !dashboardFraudPath.test(request.url)) return;

  await requireUser(request, reply);
  if (reply.sent) return;
  const auth = request as AuthenticatedRequest;
  const permissions = await readAdministrativePermissions(auth.user.sub);
  if (!permissions.has('risk.read')) {
    reply.code(403).send({ error: 'Administrative permission required', permission: 'risk.read' });
    return;
  }

  const [signals, reports, chargebacks] = await Promise.all([
    db.selectFrom('risk_signals')
      .select([
        'id', 'rule_key', 'category', 'severity', 'score', 'status', 'user_id', 'listing_id',
        'offer_id', 'order_id', 'payment_intent_id', 'report_id', 'source_event_type', 'summary',
        'detected_at', 'last_observed_at', 'occurrence_count', 'review_disposition', 'reviewed_at'
      ])
      .orderBy('score', 'desc').orderBy('last_observed_at', 'desc').limit(100).execute(),
    permissions.has('moderation.queue.read') ? db.selectFrom('reports')
      .select(['id', 'listing_id', 'reported_user_id', 'reason', 'details', 'created_at'])
      .where('resolved_at', 'is', null).where('reason', 'ilike', '%fraud%')
      .orderBy('created_at', 'desc').limit(50).execute() : [],
    permissions.has('payments.read') ? db.selectFrom('payment_operations')
      .select(['id', 'order_id', 'status', 'amount', 'currency_code', 'reason', 'requested_at'])
      .where('kind', '=', 'chargeback').orderBy('requested_at', 'desc').limit(50).execute() : []
  ]);

  reply.send({
    source: 'persisted_risk_signals',
    automatedRiskRules: true,
    permissions: [...permissions].filter((permission) => permission.startsWith('risk.')).sort(),
    signals: signals.map((row) => ({
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
      detectedAt: row.detected_at,
      lastObservedAt: row.last_observed_at,
      occurrenceCount: Number(row.occurrence_count),
      reviewDisposition: row.review_disposition,
      reviewedAt: row.reviewed_at
    })),
    reports: reports.map((row) => ({
      id: row.id, listingId: row.listing_id, subjectUserId: row.reported_user_id,
      reason: row.reason, details: row.details, createdAt: row.created_at
    })),
    chargebacks: chargebacks.map((row) => ({
      id: row.id, orderId: row.order_id, status: row.status, amount: row.amount,
      currencyCode: row.currency_code, reason: row.reason, requestedAt: row.requested_at
    }))
  });
}
