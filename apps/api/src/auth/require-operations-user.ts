import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireUser, type AuthenticatedRequest } from './require-user.js';

export interface OperationsRequest extends AuthenticatedRequest {
  operationsUserId: string;
}

function configuredOperationsUsers(): Set<string> {
  return new Set(
    (process.env.OPERATIONS_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export async function requireOperationsUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireUser(request, reply);
  if (reply.sent) {
    return;
  }

  const authRequest = request as AuthenticatedRequest;
  const allowedUsers = configuredOperationsUsers();
  if (!allowedUsers.has(authRequest.user.sub)) {
    reply.code(403).send({ error: 'Operations access required' });
    return;
  }

  Object.assign(request, { operationsUserId: authRequest.user.sub });
}
