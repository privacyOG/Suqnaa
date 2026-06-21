import { createHash } from 'node:crypto';

export type SecurityAuditDecision =
  | 'allow'
  | 'challenge'
  | 'slow_down'
  | 'reject'
  | 'rate_limited';

export interface SecurityAuditEvent {
  action: string;
  decision: SecurityAuditDecision;
  actorId?: string;
  targetId?: string;
  ip?: string;
  riskScore?: number;
  reasonCodes?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SecurityAuditLogger {
  info(data: object, message?: string): void;
  warn(data: object, message?: string): void;
}

function networkIdentifier(ip: string | undefined): string | undefined {
  if (!ip) {
    return undefined;
  }

  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export function writeSecurityAudit(
  logger: SecurityAuditLogger,
  event: SecurityAuditEvent
): void {
  const payload = {
    event: 'security.decision',
    action: event.action,
    decision: event.decision,
    actorId: event.actorId,
    targetId: event.targetId,
    networkId: networkIdentifier(event.ip),
    riskScore: event.riskScore,
    reasonCodes: event.reasonCodes ?? [],
    metadata: event.metadata ?? {},
    occurredAt: new Date().toISOString()
  };

  if (event.decision === 'allow') {
    logger.info(payload, 'Security decision');
    return;
  }

  logger.warn(payload, 'Security decision');
}
