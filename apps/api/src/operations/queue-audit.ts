interface QueueAuditWriter {
  insertInto(table: 'audit_logs'): {
    values(value: Record<string, unknown>): {
      execute(): Promise<unknown>;
    };
  };
}

export interface QueueAuditInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: Date;
}

export async function recordQueueAudit(
  writer: unknown,
  input: QueueAuditInput
): Promise<void> {
  const queueAuditWriter = writer as QueueAuditWriter;
  await queueAuditWriter.insertInto('audit_logs')
    .values({
      actor_user_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      ip_address: input.ipAddress,
      metadata: input.metadata,
      created_at: input.createdAt
    })
    .execute();
}
