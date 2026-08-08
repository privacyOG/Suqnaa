import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireOperationsUser, type OperationsRequest } from '../auth/require-operations-user.js';
import {
  DisputeWorkflowError,
  beginOperationsReview,
  decideDisputeAppeal,
  disputeOutcomes,
  listOperationsDisputes,
  readDisputeDetail,
  reconcileDisputeDeadlines,
  resolveDispute
} from '../disputes/dispute-service.js';
import { evaluateDisputeProtectionEligibility } from '../protection/protection-policy.js';
import {
  ProtectionWorkflowError,
  completeReturnProtection,
  materializeProtectionResolution,
  reconcileReturnDeadlines
} from '../protection/protection-service.js';

const uuid = z.string().uuid();
const statuses = z.enum(['opened', 'awaiting_buyer', 'awaiting_seller', 'under_review', 'resolved', 'closed']);
const listQuery = z.object({
  status: statuses.optional(),
  overdue: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
}).strict();
const reviewBody = z.object({
  requestFrom: z.enum(['buyer', 'seller']).nullable().optional(),
  note: z.string().trim().max(2000).optional()
}).strict();
const resolveBody = z.object({
  outcome: z.enum(disputeOutcomes),
  resolutionNotes: z.string().trim().min(8).max(4000),
  partialRefundAmount: z.union([z.string(), z.number()]).optional()
}).strict();
const appealBody = z.object({
  decision: z.enum(['upheld', 'changed', 'rejected', 'escalated']),
  notes: z.string().trim().min(8).max(4000)
}).strict();
const reconcileBody = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).strict();
const returnResolveBody = z.object({
  decision: z.enum(['refund_buyer', 'release_seller']),
  reason: z.string().trim().min(8).max(2000)
}).strict();

function operationError(reply: any, error: unknown) {
  if (error instanceof DisputeWorkflowError) {
    return reply.code(error.statusCode).send({ error: 'Dispute operation rejected', code: error.code });
  }
  if (error instanceof ProtectionWorkflowError) {
    return reply.code(error.statusCode).send({ error: 'Protection operation rejected', code: error.code });
  }
  throw error;
}

export async function operationsDisputeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/disputes', { preHandler: requireOperationsUser }, async (request, reply) => {
    const query = listQuery.parse(request.query);
    return reply.send({ disputes: await listOperationsDisputes(query) });
  });

  app.get('/operations/disputes/:disputeId', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    try { return reply.send(await readDisputeDetail(params.disputeId, auth.operationsUserId)); }
    catch (error) { return operationError(reply, error); }
  });

  app.post('/operations/disputes/:disputeId/review', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    const body = reviewBody.parse(request.body);
    try {
      return reply.send(await beginOperationsReview({
        disputeId: params.disputeId,
        reviewerId: auth.operationsUserId,
        requestFrom: body.requestFrom ?? null,
        note: body.note
      }));
    } catch (error) { return operationError(reply, error); }
  });

  app.post('/operations/disputes/:disputeId/resolve', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    const body = resolveBody.parse(request.body);
    try {
      const eligibility = await evaluateDisputeProtectionEligibility({
        disputeId: params.disputeId,
        outcome: body.outcome
      });
      const buyerProtectionRemedy = ['buyer_refund', 'partial_refund', 'return_required'].includes(body.outcome);
      if (buyerProtectionRemedy && !eligibility.eligible) {
        throw new ProtectionWorkflowError(`protection_not_eligible:${eligibility.reasonCode}`);
      }

      const resolved = await resolveDispute({
        disputeId: params.disputeId,
        reviewerId: auth.operationsUserId,
        outcome: body.outcome,
        resolutionNotes: body.resolutionNotes,
        partialRefundAmount: body.partialRefundAmount,
        hasPaymentRequestPermission: auth.administrativePermissions.has('payments.request'),
        ipAddress: request.ip
      });
      const protection = await materializeProtectionResolution({
        disputeId: params.disputeId,
        reviewerId: auth.operationsUserId,
        outcome: body.outcome,
        resolutionNotes: body.resolutionNotes,
        eligibility
      });
      return reply.send({ ...resolved, protection });
    } catch (error) { return operationError(reply, error); }
  });

  app.post('/operations/disputes/:disputeId/appeal-decision', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    const body = appealBody.parse(request.body);
    try {
      return reply.send(await decideDisputeAppeal({
        disputeId: params.disputeId,
        reviewerId: auth.operationsUserId,
        decision: body.decision,
        notes: body.notes
      }));
    } catch (error) { return operationError(reply, error); }
  });

  app.post('/operations/disputes/reconcile-deadlines', { preHandler: requireOperationsUser }, async (request, reply) => {
    const body = reconcileBody.parse(request.body ?? {});
    return reply.send({ updated: await reconcileDisputeDeadlines(body.limit) });
  });

  app.post('/operations/returns/:returnId/resolve', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const params = z.object({ returnId: uuid }).parse(request.params);
    const body = returnResolveBody.parse(request.body);
    try {
      return reply.send(await completeReturnProtection({
        returnId: params.returnId,
        reviewerId: auth.operationsUserId,
        decision: body.decision,
        reason: body.reason,
        hasPaymentRequestPermission: auth.administrativePermissions.has('payments.request'),
        ipAddress: request.ip
      }));
    } catch (error) { return operationError(reply, error); }
  });

  app.post('/operations/returns/reconcile-deadlines', { preHandler: requireOperationsUser }, async (request, reply) => {
    const body = reconcileBody.parse(request.body ?? {});
    return reply.send({ updated: await reconcileReturnDeadlines(body.limit) });
  });
}
