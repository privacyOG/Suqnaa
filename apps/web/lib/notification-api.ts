'use client';

import { getAuthed, postAuthed } from './authed-api';

export interface MarketplaceNotification {
  id: string;
  eventType: string;
  eventFamily: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  eventFamily: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  updatedAt: string | null;
}

export async function getMarketplaceNotifications(input?: {
  unreadOnly?: boolean;
  limit?: number;
  before?: string;
}) {
  const query = new URLSearchParams();
  query.set('limit', String(input?.limit ?? 50));
  if (input?.unreadOnly) query.set('unreadOnly', 'true');
  if (input?.before) query.set('before', input.before);
  return getAuthed<{
    notifications: MarketplaceNotification[];
    unreadCount: number;
    pagination: { hasMore: boolean; nextCursor: string | null };
  }>(`/v1/notifications?${query.toString()}`);
}

export function markMarketplaceNotificationRead(notificationId: string) {
  return postAuthed(`/v1/notifications/${encodeURIComponent(notificationId)}/read`, {});
}

export function markAllMarketplaceNotificationsRead() {
  return postAuthed('/v1/notifications/read-all', {});
}

export async function getMarketplaceNotificationPreferences() {
  const payload = await getAuthed<{ preferences: NotificationPreference[] }>(
    '/v1/notifications/preferences'
  );
  return payload.preferences;
}

export function updateMarketplaceNotificationPreference(preference: NotificationPreference) {
  return postAuthed<{ preference: NotificationPreference }>('/v1/notifications/preferences', {
    eventFamily: preference.eventFamily,
    emailEnabled: preference.emailEnabled,
    smsEnabled: preference.smsEnabled,
    pushEnabled: preference.pushEnabled
  });
}
