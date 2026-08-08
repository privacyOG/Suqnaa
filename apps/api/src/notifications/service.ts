import { db } from '../db/index.js';
import type { NotificationChannel, NotificationDeliveryProvider } from './provider.js';

export const notificationEventFamilies = [
  'messages',
  'offers',
  'orders',
  'payments',
  'fulfilment',
  'disputes',
  'account_security'
] as const;

export type NotificationEventFamily = typeof notificationEventFamilies[number];

export class NotificationNotFoundError extends Error {}
export class NotificationConflictError extends Error {}

export async function listNotifications(input: {
  userId: string;
  limit?: number;
  unreadOnly?: boolean;
  before?: Date;
}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 30));
  let query = db.selectFrom('notifications')
    .select([
      'id',
      'event_type',
      'event_family',
      'title',
      'body',
      'entity_type',
      'entity_id',
      'metadata',
      'read_at',
      'created_at'
    ])
    .where('user_id', '=', input.userId);

  if (input.unreadOnly) {
    query = query.where('read_at', 'is', null);
  }
  if (input.before) {
    query = query.where('created_at', '<', input.before);
  }

  const rows = await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit + 1)
    .execute();
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  const unread = await db.selectFrom('notifications')
    .select((expression) => expression.fn.countAll<number>().as('count'))
    .where('user_id', '=', input.userId)
    .where('read_at', 'is', null)
    .executeTakeFirst();

  return {
    notifications: page.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      eventFamily: row.event_family,
      title: row.title,
      body: row.body,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata ?? {},
      readAt: row.read_at,
      createdAt: row.created_at
    })),
    unreadCount: Number(unread?.count ?? 0),
    pagination: {
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit && last
        ? new Date(last.created_at).toISOString()
        : null
    }
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const now = new Date();
  const updated = await db.updateTable('notifications')
    .set({ read_at: now })
    .where('id', '=', notificationId)
    .where('user_id', '=', userId)
    .where('read_at', 'is', null)
    .returning(['id', 'read_at'])
    .executeTakeFirst();

  if (updated) {
    return { id: updated.id, readAt: updated.read_at, unchanged: false };
  }

  const existing = await db.selectFrom('notifications')
    .select(['id', 'read_at'])
    .where('id', '=', notificationId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!existing) throw new NotificationNotFoundError('Notification not found');
  return { id: existing.id, readAt: existing.read_at, unchanged: true };
}

export async function markAllNotificationsRead(userId: string) {
  const now = new Date();
  const result = await db.updateTable('notifications')
    .set({ read_at: now })
    .where('user_id', '=', userId)
    .where('read_at', 'is', null)
    .executeTakeFirst();
  return { updated: Number(result.numUpdatedRows ?? 0), readAt: now };
}

export async function getNotificationPreferences(userId: string) {
  const rows = await db.selectFrom('notification_preferences')
    .select(['event_family', 'email_enabled', 'sms_enabled', 'push_enabled', 'updated_at'])
    .where('user_id', '=', userId)
    .execute();
  const byFamily = new Map(rows.map((row) => [String(row.event_family), row]));

  return notificationEventFamilies.map((family) => {
    const row = byFamily.get(family);
    return {
      eventFamily: family,
      emailEnabled: row?.email_enabled ?? true,
      smsEnabled: row?.sms_enabled ?? false,
      pushEnabled: row?.push_enabled ?? true,
      updatedAt: row?.updated_at ?? null
    };
  });
}

export async function updateNotificationPreference(input: {
  userId: string;
  eventFamily: NotificationEventFamily;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
}) {
  const now = new Date();
  const row = await db.insertInto('notification_preferences')
    .values({
      user_id: input.userId,
      event_family: input.eventFamily,
      email_enabled: input.emailEnabled,
      sms_enabled: input.smsEnabled,
      push_enabled: input.pushEnabled,
      updated_at: now
    })
    .onConflict((conflict) => conflict.columns(['user_id', 'event_family']).doUpdateSet({
      email_enabled: input.emailEnabled,
      sms_enabled: input.smsEnabled,
      push_enabled: input.pushEnabled,
      updated_at: now
    }))
    .returning(['event_family', 'email_enabled', 'sms_enabled', 'push_enabled', 'updated_at'])
    .executeTakeFirstOrThrow();

  return {
    eventFamily: row.event_family,
    emailEnabled: row.email_enabled,
    smsEnabled: row.sms_enabled,
    pushEnabled: row.push_enabled,
    updatedAt: row.updated_at
  };
}

export async function registerPushTarget(input: {
  userId: string;
  provider: string;
  platform: 'web' | 'android' | 'ios';
  destination: string;
}) {
  const provider = input.provider.trim().toLowerCase();
  const destination = input.destination.trim();
  const existing = await db.selectFrom('notification_push_targets')
    .select(['id', 'user_id'])
    .where('provider', '=', provider)
    .where('destination', '=', destination)
    .executeTakeFirst();

  if (existing && existing.user_id !== input.userId) {
    throw new NotificationConflictError('Push target is already registered');
  }

  const now = new Date();
  if (existing) {
    const row = await db.updateTable('notification_push_targets')
      .set({ platform: input.platform, last_seen_at: now, revoked_at: null })
      .where('id', '=', existing.id)
      .where('user_id', '=', input.userId)
      .returning(['id', 'provider', 'platform', 'created_at', 'last_seen_at'])
      .executeTakeFirstOrThrow();
    return row;
  }

  return db.insertInto('notification_push_targets')
    .values({
      user_id: input.userId,
      provider,
      platform: input.platform,
      destination,
      created_at: now,
      last_seen_at: now,
      revoked_at: null
    })
    .returning(['id', 'provider', 'platform', 'created_at', 'last_seen_at'])
    .executeTakeFirstOrThrow();
}

export async function revokePushTarget(userId: string, targetId: string) {
  const updated = await db.updateTable('notification_push_targets')
    .set({ revoked_at: new Date() })
    .where('id', '=', targetId)
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .returning(['id'])
    .executeTakeFirst();
  if (updated) return { id: updated.id, unchanged: false };

  const existing = await db.selectFrom('notification_push_targets')
    .select(['id'])
    .where('id', '=', targetId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!existing) throw new NotificationNotFoundError('Push target not found');
  return { id: existing.id, unchanged: true };
}

interface ClaimedDelivery {
  id: string;
  notification_id: string;
  channel: NotificationChannel;
  destination: string;
  attempt_count: number;
}

export async function claimNotificationDeliveries(input: {
  batchSize: number;
  lockTimeoutMs: number;
  now?: Date;
}): Promise<ClaimedDelivery[]> {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - input.lockTimeoutMs);

  return db.transaction().execute(async (transaction) => {
    const rows = await transaction.selectFrom('notification_deliveries')
      .select(['id', 'notification_id', 'channel', 'destination', 'attempt_count'])
      .where('next_attempt_at', '<=', now)
      .where((expression) => expression.or([
        expression('status', 'in', ['pending', 'failed']),
        expression.and([
          expression('status', '=', 'processing'),
          expression('locked_at', '<', staleBefore)
        ])
      ]))
      .orderBy('next_attempt_at', 'asc')
      .orderBy('created_at', 'asc')
      .limit(input.batchSize)
      .forUpdate()
      .skipLocked()
      .execute() as ClaimedDelivery[];

    for (const row of rows) {
      await transaction.updateTable('notification_deliveries')
        .set({
          status: 'processing',
          attempt_count: Number(row.attempt_count) + 1,
          locked_at: now,
          updated_at: now
        })
        .where('id', '=', row.id)
        .execute();
      row.attempt_count = Number(row.attempt_count) + 1;
    }
    return rows;
  });
}

function retryDelayMs(attempt: number): number {
  const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
  return delays[Math.min(Math.max(0, attempt - 1), delays.length - 1)];
}

function errorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Notification delivery failed';
  return message.replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

export async function deliverClaimedNotification(input: {
  delivery: ClaimedDelivery;
  provider: NotificationDeliveryProvider;
  maxAttempts: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const notification = await db.selectFrom('notifications')
    .select(['id', 'event_type', 'title', 'body', 'metadata', 'dedupe_key'])
    .where('id', '=', input.delivery.notification_id)
    .executeTakeFirst();

  if (!notification) {
    await db.updateTable('notification_deliveries')
      .set({ status: 'dead', last_error: 'Notification no longer exists', locked_at: null, updated_at: now })
      .where('id', '=', input.delivery.id)
      .execute();
    return { outcome: 'dead' as const };
  }

  try {
    const result = await input.provider.deliver({
      deliveryId: input.delivery.id,
      notificationId: notification.id,
      channel: input.delivery.channel,
      destination: input.delivery.destination,
      eventType: notification.event_type,
      title: notification.title,
      body: notification.body,
      metadata: (notification.metadata ?? {}) as Record<string, unknown>,
      dedupeKey: `${notification.dedupe_key}:${input.delivery.channel}:${input.delivery.destination}`
    });

    await db.updateTable('notification_deliveries')
      .set({
        status: 'sent',
        delivered_at: now,
        provider_message_id: result.providerMessageId ?? null,
        last_error: null,
        locked_at: null,
        updated_at: now
      })
      .where('id', '=', input.delivery.id)
      .where('status', '=', 'processing')
      .execute();
    return { outcome: 'sent' as const };
  } catch (error) {
    const dead = input.delivery.attempt_count >= input.maxAttempts;
    await db.updateTable('notification_deliveries')
      .set({
        status: dead ? 'dead' : 'failed',
        next_attempt_at: dead
          ? now
          : new Date(now.getTime() + retryDelayMs(input.delivery.attempt_count)),
        last_error: errorSummary(error),
        locked_at: null,
        updated_at: now
      })
      .where('id', '=', input.delivery.id)
      .where('status', '=', 'processing')
      .execute();
    return { outcome: dead ? 'dead' as const : 'failed' as const };
  }
}