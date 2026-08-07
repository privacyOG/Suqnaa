import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  requirePermission,
  type AdministrativePermission,
  type AuthorizedOperationsRequest
} from './require-permission.js';

export type OperationsRequest = AuthorizedOperationsRequest;

const routePermissions: readonly {
  method: 'GET' | 'POST';
  pattern: RegExp;
  permission: AdministrativePermission;
}[] = [
  { method: 'GET', pattern: /^\/v1\/operations\/health(?:\?.*)?$/, permission: 'operations.access' },
  { method: 'GET', pattern: /^\/v1\/operations\/queue(?:\?.*)?$/, permission: 'moderation.queue.read' },
  { method: 'POST', pattern: /^\/v1\/operations\/queue\/[0-9a-fA-F-]+\/complete(?:\?.*)?$/, permission: 'moderation.queue.resolve' },
  { method: 'POST', pattern: /^\/v1\/operations\/queue\/[0-9a-fA-F-]+\/listing-status(?:\?.*)?$/, permission: 'moderation.listing.manage' },
  { method: 'POST', pattern: /^\/v1\/operations\/queue\/[0-9a-fA-F-]+\/account-status(?:\?.*)?$/, permission: 'moderation.account.manage' },
  { method: 'GET', pattern: /^\/v1\/operations\/records(?:\?.*)?$/, permission: 'audit.read' },
  { method: 'GET', pattern: /^\/v1\/operations\/verifications(?:\?.*)?$/, permission: 'verification.read' },
  { method: 'POST', pattern: /^\/v1\/operations\/verifications\/[0-9a-fA-F-]+\/review(?:\?.*)?$/, permission: 'verification.review' }
];

export function permissionForOperationsRequest(method: string, url: string): AdministrativePermission | null {
  const route = routePermissions.find((candidate) =>
    candidate.method === method && candidate.pattern.test(url)
  );
  return route?.permission ?? null;
}

export async function requireOperationsUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const permission = permissionForOperationsRequest(request.method, request.url);
  if (!permission) {
    reply.code(403).send({ error: 'Administrative route is not permission-mapped' });
    return;
  }

  await requirePermission(permission)(request, reply);
}
