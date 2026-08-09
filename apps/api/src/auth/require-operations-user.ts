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
  { method: 'GET', pattern: /^\/v1\/operations\/dashboard(?:\?.*)?$/, permission: 'operations.access' },
  { method: 'GET', pattern: /^\/v1\/operations\/dashboard\/accounts(?:\?.*)?$/, permission: 'moderation.account.manage' },
  { method: 'GET', pattern: /^\/v1\/operations\/dashboard\/listings(?:\?.*)?$/, permission: 'moderation.listing.manage' },
  { method: 'GET', pattern: /^\/v1\/operations\/dashboard\/categories(?:\?.*)?$/, permission: 'operations.access' },
  { method: 'GET', pattern: /^\/v1\/operations\/dashboard\/fulfilment(?:\?.*)?$/, permission: 'disputes.read' },
  { method: 'GET', pattern: /^\/v1\/operations\/dashboard\/fraud(?:\?.*)?$/, permission: 'operations.access' },
  { method: 'GET', pattern: /^\/v1\/operations\/queue(?:\?.*)?$/, permission: 'moderation.queue.read' },
  { method: 'GET', pattern: /^\/v1\/operations\/queue\/[0-9a-fA-F-]+\/conversation-context(?:\?.*)?$/, permission: 'moderation.queue.read' },
  { method: 'POST', pattern: /^\/v1\/operations\/queue\/[0-9a-fA-F-]+\/complete(?:\?.*)?$/, permission: 'moderation.queue.resolve' },
  { method: 'POST', pattern: /^\/v1\/operations\/queue\/[0-9a-fA-F-]+\/listing-status(?:\?.*)?$/, permission: 'moderation.listing.manage' },
  { method: 'POST', pattern: /^\/v1\/operations\/queue\/[0-9a-fA-F-]+\/account-status(?:\?.*)?$/, permission: 'moderation.account.manage' },
  { method: 'GET', pattern: /^\/v1\/operations\/moderation\/policy-rules(?:\?.*)?$/, permission: 'moderation.policy.manage' },
  { method: 'POST', pattern: /^\/v1\/operations\/moderation\/policy-rules(?:\?.*)?$/, permission: 'moderation.policy.manage' },
  { method: 'POST', pattern: /^\/v1\/operations\/moderation\/policy-rules\/[0-9a-fA-F-]+\/status(?:\?.*)?$/, permission: 'moderation.policy.manage' },
  { method: 'GET', pattern: /^\/v1\/operations\/moderation\/actions(?:\?.*)?$/, permission: 'moderation.queue.read' },
  { method: 'POST', pattern: /^\/v1\/operations\/moderation\/actions\/[0-9a-fA-F-]+\/notes(?:\?.*)?$/, permission: 'moderation.queue.resolve' },
  { method: 'POST', pattern: /^\/v1\/operations\/moderation\/listings\/[0-9a-fA-F-]+\/action(?:\?.*)?$/, permission: 'moderation.listing.manage' },
  { method: 'POST', pattern: /^\/v1\/operations\/moderation\/accounts\/[0-9a-fA-F-]+\/action(?:\?.*)?$/, permission: 'moderation.account.manage' },
  { method: 'GET', pattern: /^\/v1\/operations\/moderation\/appeals(?:\?.*)?$/, permission: 'moderation.appeal.review' },
  { method: 'POST', pattern: /^\/v1\/operations\/moderation\/appeals\/[0-9a-fA-F-]+\/decision(?:\?.*)?$/, permission: 'moderation.appeal.review' },
  { method: 'POST', pattern: /^\/v1\/operations\/moderation\/reconcile-retention(?:\?.*)?$/, permission: 'moderation.policy.manage' },
  { method: 'GET', pattern: /^\/v1\/operations\/records(?:\?.*)?$/, permission: 'audit.read' },
  { method: 'GET', pattern: /^\/v1\/operations\/verifications(?:\?.*)?$/, permission: 'verification.read' },
  { method: 'POST', pattern: /^\/v1\/operations\/verifications\/[0-9a-fA-F-]+\/review(?:\?.*)?$/, permission: 'verification.review' },
  { method: 'GET', pattern: /^\/v1\/operations\/payments(?:\?.*)?$/, permission: 'payments.read' },
  { method: 'POST', pattern: /^\/v1\/operations\/payments\/[0-9a-fA-F-]+\/request(?:\?.*)?$/, permission: 'payments.request' },
  { method: 'POST', pattern: /^\/v1\/operations\/payment-operations\/[0-9a-fA-F-]+\/decision(?:\?.*)?$/, permission: 'payments.approve' },
  { method: 'GET', pattern: /^\/v1\/operations\/settlements(?:\?.*)?$/, permission: 'settlements.read' },
  { method: 'POST', pattern: /^\/v1\/operations\/settlements\/run(?:\?.*)?$/, permission: 'settlements.run' },
  { method: 'GET', pattern: /^\/v1\/operations\/disputes(?:\?.*)?$/, permission: 'disputes.read' },
  { method: 'GET', pattern: /^\/v1\/operations\/disputes\/[0-9a-fA-F-]+(?:\?.*)?$/, permission: 'disputes.read' },
  { method: 'POST', pattern: /^\/v1\/operations\/disputes\/reconcile-deadlines(?:\?.*)?$/, permission: 'disputes.review' },
  { method: 'POST', pattern: /^\/v1\/operations\/disputes\/[0-9a-fA-F-]+\/review(?:\?.*)?$/, permission: 'disputes.review' },
  { method: 'POST', pattern: /^\/v1\/operations\/disputes\/[0-9a-fA-F-]+\/resolve(?:\?.*)?$/, permission: 'disputes.resolve' },
  { method: 'POST', pattern: /^\/v1\/operations\/disputes\/[0-9a-fA-F-]+\/appeal-decision(?:\?.*)?$/, permission: 'disputes.resolve' },
  { method: 'POST', pattern: /^\/v1\/operations\/returns\/reconcile-deadlines(?:\?.*)?$/, permission: 'disputes.review' },
  { method: 'POST', pattern: /^\/v1\/operations\/returns\/[0-9a-fA-F-]+\/resolve(?:\?.*)?$/, permission: 'disputes.resolve' }
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
