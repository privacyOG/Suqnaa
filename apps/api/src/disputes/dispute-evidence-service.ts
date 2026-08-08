import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { readAdministrativePermissions } from '../auth/require-permission.js';
import {
  type DisputeEvidenceMimeType,
  extensionForDisputeEvidence,
  getDisputeEvidenceStorage,
  maximumDisputeEvidenceItems
} from './dispute-evidence-storage.js';
import { DisputeWorkflowError } from './dispute-service.js';

async function authorizeCase(disputeId: string, userId: string) {
  const dispute = await db.selectFrom('disputes').selectAll().where('id', '=', disputeId).executeTakeFirst();
  if (!dispute) throw new DisputeWorkflowError('dispute_not_found', 404);
  if (dispute.opened_by_user_id === userId || dispute.respondent_user_id === userId) return dispute;
  const permissions = await readAdministrativePermissions(userId);
  if (!permissions.has('disputes.read')) throw new DisputeWorkflowError('dispute_not_found', 404);
  return dispute;
}

export async function storeBinaryDisputeEvidence(input: {
  disputeId: string;
  submittedBy: string;
  evidenceType: string;
  filename: string;
  mimeType: DisputeEvidenceMimeType;
  buffer: Buffer;
  note?: string | null;
}) {
  const dispute = await authorizeCase(input.disputeId, input.submittedBy);
  if (dispute.opened_by_user_id !== input.submittedBy && dispute.respondent_user_id !== input.submittedBy) {
    throw new DisputeWorkflowError('participant_evidence_only', 403);
  }
  if (dispute.status === 'closed') throw new DisputeWorkflowError('dispute_closed');

  const countRow = await db.selectFrom('dispute_evidence')
    .select((eb: any) => eb.fn.countAll<number>().as('count'))
    .where('dispute_id', '=', dispute.id)
    .where('removed_at', 'is', null)
    .executeTakeFirstOrThrow();
  if (Number(countRow.count) >= maximumDisputeEvidenceItems) {
    throw new DisputeWorkflowError('evidence_limit_reached');
  }

  const evidenceId = randomUUID();
  const extension = extensionForDisputeEvidence(input.mimeType);
  const objectKey = `dispute-evidence/${dispute.id}/${evidenceId}.${extension}`;
  const storage = getDisputeEvidenceStorage();
  const stored = await storage.put({ objectKey, buffer: input.buffer, mimeType: input.mimeType });
  const now = new Date();

  try {
    const evidence = await db.transaction().execute(async (trx) => {
      const current = await trx.selectFrom('disputes').selectAll()
        .where('id', '=', dispute.id).forUpdate().executeTakeFirstOrThrow();
      if (current.status === 'closed') throw new DisputeWorkflowError('dispute_closed');
      const inserted = await trx.insertInto('dispute_evidence').values({
        id: evidenceId,
        dispute_id: current.id,
        submitted_by_user_id: input.submittedBy,
        evidence_type: input.evidenceType,
        object_key: stored.objectKey,
        filename: input.filename.trim(),
        mime_type: input.mimeType,
        size_bytes: input.buffer.length,
        sha256: stored.sha256,
        note: input.note?.trim() || null,
        text_value: null,
        created_at: now
      }).returning(['id', 'created_at']).executeTakeFirstOrThrow();
      await trx.updateTable('disputes').set({ last_activity_at: now, updated_at: now })
        .where('id', '=', current.id).execute();
      await trx.insertInto('dispute_events').values({
        dispute_id: current.id,
        actor_user_id: input.submittedBy,
        event_type: 'evidence_added',
        details: JSON.stringify({ evidenceId, type: input.evidenceType, transport: 'binary' }),
        occurred_at: now,
        created_at: now
      }).execute();
      return inserted;
    });
    return { ...evidence, storageDriver: storage.driver };
  } catch (error) {
    try { await storage.remove(stored.objectKey); } catch { /* best-effort rollback */ }
    throw error;
  }
}

export async function deliverDisputeEvidence(input: {
  disputeId: string;
  evidenceId: string;
  requestedBy: string;
}) {
  await authorizeCase(input.disputeId, input.requestedBy);
  const evidence = await db.selectFrom('dispute_evidence')
    .select(['id', 'dispute_id', 'object_key', 'mime_type', 'filename', 'size_bytes'])
    .where('id', '=', input.evidenceId)
    .where('dispute_id', '=', input.disputeId)
    .where('removed_at', 'is', null)
    .executeTakeFirst();
  if (!evidence || !evidence.object_key || !evidence.mime_type) {
    throw new DisputeWorkflowError('evidence_not_found', 404);
  }
  const delivery = await getDisputeEvidenceStorage().deliver(String(evidence.object_key), String(evidence.mime_type));
  return {
    delivery,
    filename: evidence.filename ? String(evidence.filename) : `evidence-${evidence.id}`,
    mimeType: String(evidence.mime_type),
    sizeBytes: Number(evidence.size_bytes ?? 0)
  };
}
