import { db } from '../db/index.js';
import type { NotificationChannel } from './provider.js';

export interface ClaimedNotificationDelivery {
  id: string;
  notification_id: string;
  channel: NotificationChannel;
  destination: string;
  attempt_count: number;
}

export async function claimEnabledNotificationDeliveries(input: {
  channels: NotificationChannel[];
  batchSize: number;
  lockTimeoutMs: number;
  now?: Date;
}): Promise<ClaimedNotificationDelivery[]> {
  if (input.channels.length === 0) {
    return [];
  }

  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - input.lockTimeoutMs);

  return db.transaction().execute(async (transaction) => {
    const rows = await transaction.selectFrom('notification_deliveries')
      .select(['id', 'notification_id', 'channel', 'destination', 'attempt_count'])
      .where('channel', 'in', input.channels)
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
      .execute() as ClaimedNotificationDelivery[];

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
