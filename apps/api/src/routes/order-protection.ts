import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  ProtectionWorkflowError,
  acknowledgeReturnedItem,
  readOrderProtection,
  shipReturn
} from '../protection/protection-service.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const uuid = z.string().uuid();
const httpsUrl = z.string().trim().url().max(1000).refine((value) => new URL(value).protocol === 'https:', 'HTTPS URL required');
const shipBody = z.object({
  carrier: z.string().trim().min(2).max(80),
  trackingReference: z.string().trim().min(2).max(200),
  trackingUrl: httpsUrl.optional()
}).strict();
const receiptBody = z.object({
  condition: z.enum(['accepted', 'contested']),
  note: z.string().trim().min(8).max(4000).optional()
}).strict();

function protectionError(reply: any, error: unknown) {
  if (error instanceof ProtectionWorkflowError) {
    return reply.code(error.statusCode).send({ error: 'Protection action rejected', code: error.code });
  }
  throw error;
}

function participantLimit(request: FastifyRequest, userId: string, action: string, limit: number) {
  const result = checkRateLimit({
    group: `protection.${action}`,
    identifiers: [`account:${userId}`, `ip:${request.ip}`],
    limit,
    windowMs: 60 * 60 * 1000
  });
  return result.allowed ? null : result;
}

export async function orderProtectionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/market/orders/:orderId/protection', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ orderId: uuid }).parse(request.params);
    try {
      return reply.send(await readOrderProtection({ orderId: params.orderId, requestedBy: auth.user.sub }));
    } catch (error) { return protectionError(reply, error); }
  });

  app.post('/market/returns/:returnId/ship', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ returnId: uuid }).parse(request.params);
    const body = shipBody.parse(request.body);
    const limited = participantLimit(request, auth.user.sub, 'return_ship', 12);
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }
    try {
      const returned = await shipReturn({
        returnId: params.returnId,
        buyerId: auth.user.sub,
        carrier: body.carrier,
        trackingReference: body.trackingReference,
        trackingUrl: body.trackingUrl
      });
      writeSecurityAudit(app.log, {
        action: 'protection.return.ship', decision: 'allow', actorId: auth.user.sub,
        targetId: params.returnId, ip: request.ip, reasonCodes: ['buyer_return_shipped'],
        metadata: { carrier: body.carrier }
      });
      return reply.send({ return: returned });
    } catch (error) { return protectionError(reply, error); }
  });

  app.post('/market/returns/:returnId/receipt', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const params = z.object({ returnId: uuid }).parse(request.params);
    const body = receiptBody.parse(request.body);
    if (body.condition === 'contested' && !body.note) {
      return reply.code(400).send({ error: 'Protection action rejected', code: 'contest_note_required' });
    }
    const limited = participantLimit(request, auth.user.sub, 'return_receipt', 12);
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }
    try {
      const returned = await acknowledgeReturnedItem({
        returnId: params.returnId,
        sellerId: auth.user.sub,
        condition: body.condition,
        note: body.note
      });
      writeSecurityAudit(app.log, {
        action: 'protection.return.receipt', decision: 'allow', actorId: auth.user.sub,
        targetId: params.returnId, ip: request.ip,
        reasonCodes: [body.condition === 'accepted' ? 'seller_return_accepted' : 'seller_return_contested'],
        metadata: { condition: body.condition }
      });
      return reply.send({ return: returned });
    } catch (error) { return protectionError(reply, error); }
  });
}
