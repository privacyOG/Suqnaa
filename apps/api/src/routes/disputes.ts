import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  DisputeWorkflowError,
  appealDispute,
  disputeCategories,
  listParticipantDisputes,
  openOrderDispute,
  readDisputeDetail,
  submitDisputeResponse,
  submitTextEvidence
} from '../disputes/dispute-service.js';
import {
  detectDisputeEvidenceMime,
  maximumDisputeEvidenceBytes,
  normalizeDisputeEvidenceMime,
  supportedDisputeEvidenceMimeTypes
} from '../disputes/dispute-evidence-storage.js';
import {
  deliverDisputeEvidence,
  storeBinaryDisputeEvidence
} from '../disputes/dispute-evidence-service.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const uuid = z.string().uuid();
const openBody = z.object({
  orderId: uuid,
  category: z.enum(disputeCategories),
  reason: z.string().trim().min(20).max(4000),
  summary: z.string().trim().max(500).optional()
}).strict();
const responseBody = z.object({ responseText: z.string().trim().min(10).max(6000) }).strict();
const textEvidenceBody = z.object({
  evidenceType: z.string().trim().min(3).max(80),
  text: z.string().trim().min(3).max(10000),
  note: z.string().trim().max(2000).optional()
}).strict();
const appealBody = z.object({ reason: z.string().trim().min(20).max(4000) }).strict();
const uploadQuery = z.object({
  evidenceType: z.string().trim().min(3).max(80),
  filename: z.string().trim().min(1).max(180),
  note: z.string().trim().max(2000).optional()
}).strict();
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function disputeError(reply: any, error: unknown) {
  if (error instanceof DisputeWorkflowError) {
    return reply.code(error.statusCode).send({ error: 'Dispute action rejected', code: error.code });
  }
  throw error;
}

async function participantLimit(request: FastifyRequest, userId: string, action: string, limit: number) {
  const account = await checkSharedRateLimit({
    group: `dispute.${action}.account`, identifiers: [`account:${userId}`], limit, windowMs: 60 * 60 * 1000
  });
  const ip = await checkSharedRateLimit({
    group: `dispute.${action}.ip`, identifiers: [`ip:${request.ip}`], limit: limit * 2, windowMs: 60 * 60 * 1000
  });
  return !account.allowed ? account : !ip.allowed ? ip : null;
}

export async function disputeRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    [...supportedDisputeEvidenceMimeTypes],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  );

  app.get('/market/disputes', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const query = listQuery.parse(request.query);
    return reply.send({ disputes: await listParticipantDisputes(auth.user.sub, query.limit) });
  });

  app.post('/market/disputes', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const body = openBody.parse(request.body);
    const limited = await participantLimit(request, auth.user.sub, 'open', 10);
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }
    try {
      const dispute = await openOrderDispute({ ...body, openedBy: auth.user.sub });
      writeSecurityAudit(app.log, {
        action: 'dispute.open', decision: 'allow', actorId: auth.user.sub,
        targetId: dispute.id, ip: request.ip, reasonCodes: ['participant_dispute_opened'],
        metadata: { orderId: body.orderId, category: body.category }
      });
      return reply.code(201).send({ dispute });
    } catch (error) { return disputeError(reply, error); }
  });

  app.get('/market/disputes/:disputeId', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    try { return reply.send(await readDisputeDetail(params.disputeId, auth.user.sub)); }
    catch (error) { return disputeError(reply, error); }
  });

  app.post('/market/disputes/:disputeId/responses', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    const body = responseBody.parse(request.body);
    const limited = await participantLimit(request, auth.user.sub, 'response', 30);
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }
    try {
      return reply.code(201).send(await submitDisputeResponse({
        disputeId: params.disputeId, submittedBy: auth.user.sub, responseText: body.responseText
      }));
    } catch (error) { return disputeError(reply, error); }
  });

  app.post('/market/disputes/:disputeId/evidence/text', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    const body = textEvidenceBody.parse(request.body);
    const limited = await participantLimit(request, auth.user.sub, 'evidence', 40);
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }
    try {
      return reply.code(201).send({ evidence: await submitTextEvidence({
        disputeId: params.disputeId,
        submittedBy: auth.user.sub,
        evidenceType: body.evidenceType,
        text: body.text,
        note: body.note
      }) });
    } catch (error) { return disputeError(reply, error); }
  });

  app.post('/market/disputes/:disputeId/evidence/upload', {
    preHandler: requireUser,
    bodyLimit: maximumDisputeEvidenceBytes
  }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    const query = uploadQuery.parse(request.query);
    const limited = await participantLimit(request, auth.user.sub, 'evidence_binary', 24);
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }
    const declared = normalizeDisputeEvidenceMime(request.headers['content-type']);
    const buffer = Buffer.isBuffer(request.body) ? request.body : null;
    if (!declared || !buffer || buffer.length === 0) return reply.code(400).send({ error: 'Supported evidence body required' });
    if (buffer.length > maximumDisputeEvidenceBytes) return reply.code(413).send({ error: 'Evidence file too large' });
    const detected = detectDisputeEvidenceMime(buffer);
    if (!detected || detected !== declared) return reply.code(400).send({ error: 'Evidence type mismatch' });
    try {
      const evidence = await storeBinaryDisputeEvidence({
        disputeId: params.disputeId,
        submittedBy: auth.user.sub,
        evidenceType: query.evidenceType,
        filename: query.filename,
        mimeType: detected,
        buffer,
        note: query.note
      });
      writeSecurityAudit(app.log, {
        action: 'dispute.evidence.upload', decision: 'allow', actorId: auth.user.sub,
        targetId: params.disputeId, ip: request.ip, reasonCodes: ['private_dispute_evidence'],
        metadata: { evidenceId: evidence.id, mimeType: detected, sizeBytes: buffer.length, storageDriver: evidence.storageDriver }
      });
      return reply.code(201).send({ evidence });
    } catch (error) { return disputeError(reply, error); }
  });

  app.get('/market/disputes/:disputeId/evidence/:evidenceId', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ disputeId: uuid, evidenceId: uuid }).parse(request.params);
    try {
      const evidence = await deliverDisputeEvidence({ ...params, requestedBy: auth.user.sub });
      reply.header('Cache-Control', 'private, no-store');
      reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(evidence.filename)}`);
      if (evidence.delivery.type === 'redirect') return reply.redirect(evidence.delivery.url);
      reply.type(evidence.mimeType);
      return reply.send(evidence.delivery.buffer);
    } catch (error) { return disputeError(reply, error); }
  });

  app.post('/market/disputes/:disputeId/appeal', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ disputeId: uuid }).parse(request.params);
    const body = appealBody.parse(request.body);
    const limited = await participantLimit(request, auth.user.sub, 'appeal', 8);
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }
    try { return reply.code(201).send({ appeal: await appealDispute({ disputeId: params.disputeId, appealedBy: auth.user.sub, reason: body.reason }) }); }
    catch (error) { return disputeError(reply, error); }
  });
}
