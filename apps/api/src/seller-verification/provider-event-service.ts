import { db } from '../db/index.js';
import type {
  SellerVerificationProviderEvent,
  SellerVerificationProviderHeaders
} from './provider-event.js';
import { sellerVerificationEventFingerprint } from './provider-event.js';
import { SellerVerificationError } from './service.js';

function eventMatches(
  existing: Record<string, any>,
  headers: SellerVerificationProviderHeaders,
  event: SellerVerificationProviderEvent,
  fingerprint: string
): boolean {
  return existing.provider === headers.provider &&
    existing.provider_event_id === headers.eventId &&
    existing.event_type === event.type &&
    existing.provider_reference === event.providerReference &&
    existing.payload_fingerprint === fingerprint;
}

export async function applySellerVerificationProviderEvent(input: {
  headers: SellerVerificationProviderHeaders;
  event: SellerVerificationProviderEvent;
  receivedAt?: Date;
}) {
  const receivedAt = input.receivedAt ?? new Date();
  const occurredAt = new Date(input.event.occurredAt);
  const fingerprint = sellerVerificationEventFingerprint(input.headers.provider, input.event);

  return db.transaction().execute(async (transaction) => {
    const existing = await transaction.selectFrom('verification_provider_events')
      .select([
        'provider', 'provider_event_id', 'event_type',
        'provider_reference', 'payload_fingerprint', 'verification_check_id'
      ])
      .where('provider', '=', input.headers.provider)
      .where('provider_event_id', '=', input.headers.eventId)
      .executeTakeFirst();
    if (existing) {
      if (!eventMatches(existing, input.headers, input.event, fingerprint)) {
        throw new SellerVerificationError(409, 'event_replay_conflict', 'Seller verification event conflicts with an earlier event');
      }
      return { checkId: String(existing.verification_check_id), duplicate: true, unchanged: true };
    }

    const check = await transaction.selectFrom('verification_checks')
      .select(['id', 'user_id', 'status', 'provider_result', 'provider', 'reference', 'last_provider_event_at'])
      .where('provider', '=', input.headers.provider)
      .where('reference', '=', input.event.providerReference)
      .forUpdate()
      .executeTakeFirst();
    if (!check) {
      throw new SellerVerificationError(404, 'verification_not_found', 'Seller verification event context was not found');
    }
    if (check.last_provider_event_at && occurredAt.getTime() < new Date(check.last_provider_event_at).getTime()) {
      throw new SellerVerificationError(409, 'stale_provider_event', 'Seller verification event is older than the latest event');
    }

    await transaction.insertInto('verification_provider_events').values({
      provider: input.headers.provider,
      provider_event_id: input.headers.eventId,
      verification_check_id: check.id,
      event_type: input.event.type,
      provider_reference: input.event.providerReference,
      payload_fingerprint: fingerprint,
      occurred_at: occurredAt,
      received_at: receivedAt
    }).execute();

    const unchanged = check.status !== 'pending';
    if (!unchanged) {
      await transaction.updateTable('verification_checks')
        .set({
          status: input.event.result === 'expired' ? 'expired' : 'pending',
          provider_result: input.event.result,
          reason_code: input.event.reasonCode ?? (input.event.result === 'expired' ? 'provider_session_expired' : null),
          provider_completed_at: input.event.result === 'expired' ? null : occurredAt,
          last_provider_event_at: occurredAt,
          updated_at: receivedAt
        })
        .where('id', '=', check.id)
        .where('status', '=', 'pending')
        .execute();
      await transaction.insertInto('audit_logs').values({
        actor_user_id: null,
        action: 'seller_verification.provider_result',
        entity_type: 'verification_check',
        entity_id: check.id,
        metadata: {
          subjectUserId: check.user_id,
          provider: input.headers.provider,
          result: input.event.result,
          reasonCode: input.event.reasonCode ?? null,
          eventId: input.headers.eventId
        },
        created_at: receivedAt
      }).execute();
    }

    return { checkId: String(check.id), duplicate: false, unchanged };
  });
}
