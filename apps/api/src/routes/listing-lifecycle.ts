import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  ListingLifecycleError,
  readSellerListingLifecycle,
  renewOrReactivateListing
} from '../listings/listing-lifecycle-service.js';
import { checkHumanProtection, humanProtectionResponse } from '../security/human-protection.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

const paramsSchema = z.object({ listingId: z.string().uuid() });
const bodySchema = z.object({ version: z.number().int().positive() });

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function lifecycleError(reply: any, error: unknown) {
  if (!(error instanceof ListingLifecycleError)) return false;
  reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...error.details
  });
  return true;
}

export async function listingLifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings/:listingId/lifecycle', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = paramsSchema.parse(request.params);
    try {
      const result = await readSellerListingLifecycle({
        userId: authRequest.user.sub,
        listingId: params.listingId
      });
      return reply.send(result);
    } catch (error) {
      if (lifecycleError(reply, error)) return;
      throw error;
    }
  });

  app.post('/listings/:listingId/renew', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);
    const userId = authRequest.user.sub;

    const accountLimit = await checkSharedRateLimit({
      group: 'listing.renew.account',
      identifiers: [`account:${userId}`],
      limit: 30,
      windowMs: 60 * 60 * 1000
    });
    const ipLimit = await checkSharedRateLimit({
      group: 'listing.renew.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 100,
      windowMs: 60 * 60 * 1000
    });
    const limited = !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;
    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const protection = checkHumanProtection({
      action: 'listing.renew',
      accountId: userId,
      ip: request.ip,
      userAgent: firstHeader(request.headers['user-agent'])
    });
    if (protection.decision !== 'allow') {
      writeSecurityAudit(app.log, {
        action: 'listing.renew',
        decision: protection.decision,
        actorId: userId,
        targetId: params.listingId,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes
      });
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    try {
      const result = await renewOrReactivateListing({
        userId,
        listingId: params.listingId,
        version: body.version
      });
      writeSecurityAudit(app.log, {
        action: result.reactivated ? 'listing.reactivate' : 'listing.renew',
        decision: 'allow',
        actorId: userId,
        targetId: params.listingId,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes,
        metadata: {
          reactivated: result.reactivated,
          version: result.listing.version,
          expiresAt: result.listing.expiresAt
        }
      });
      return reply.send(result);
    } catch (error) {
      if (lifecycleError(reply, error)) return;
      throw error;
    }
  });
}
