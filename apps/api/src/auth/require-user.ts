import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, type AccessClaims } from './access.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user: AccessClaims;
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;

  if (!value?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  const claims = verifyAccessToken(value.slice('Bearer '.length));
  if (!claims) {
    reply.code(401).send({ error: 'Invalid access token' });
    return;
  }

  Object.assign(request, { user: claims });
}
