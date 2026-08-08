'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getMarketplaceNotificationPreferences,
  getMarketplaceNotifications,
  markAllMarketplaceNotificationsRead,
  markMarketplaceNotificationRead,
  type MarketplaceNotification,
  type NotificationPreference,
  updateMarketplaceNotificationPreference
} from '../lib/notification-api';

const familyLabels: Record<string, { en: string; ar: string }> = {
  messages: { en: 'Messages', ar: 'الرسائل' },
  offers: { en: 'Offers', ar: 'العروض' },
  orders: { en: 'Orders', ar: 'الطلبات' },
  payments: { en: 'Payments', ar: 'المدفوعات' },
  fulfilment: { en: 'Fulfilment', ar: 'التسليم' },
  disputes: { en: 'Disputes', ar: 'النزاعات' },
  account_security: { en: 'Account security', ar: 'أمان الحساب' }
};

export function NotificationCentre({ locale }: { locale: string }) {
  const ar = locale === 'ar';
  const [notifications, setNotifications] = useState<MarketplaceNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFamily, setSavingFamily] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inbox, preferenceRows] = await Promise.all([
        getMarketplaceNotifications({ limit: 50 }),
        getMarketplaceNotificationPreferences()
      ]);
      setNotifications(inbox.notifications);
      setUnreadCount(inbox.unreadCount);
      setPreferences(preferenceRows);
    } catch {
      setError(ar ? 'تعذر تحميل الإشعارات.' : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(notification: MarketplaceNotification) {
    if (notification.readAt) return;
    try {
      await markMarketplaceNotificationRead(notification.id);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((row) =>
        row.id === notification.id ? { ...row, readAt } : row
      ));
      setUnreadCount((value) => Math.max(0, value - 1));
    } catch {
      setError(ar ? 'تعذر تحديث الإشعار.' : 'Unable to update notification.');
    }
  }

  async function markAllRead() {
    try {
      await markAllMarketplaceNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((row) => ({
        ...row,
        readAt: row.readAt ?? readAt
      })));
      setUnreadCount(0);
    } catch {
      setError(ar ? 'تعذر تعليم الإشعارات كمقروءة.' : 'Unable to mark notifications read.');
    }
  }

  async function changePreference(
    preference: NotificationPreference,
    key: 'emailEnabled' | 'smsEnabled' | 'pushEnabled',
    value: boolean
  ) {
    const next = { ...preference, [key]: value };
    setSavingFamily(preference.eventFamily);
    setError(null);
    try {
      const response = await updateMarketplaceNotificationPreference(next);
      setPreferences((current) => current.map((row) =>
        row.eventFamily === preference.eventFamily ? response.preference : row
      ));
    } catch {
      setError(ar ? 'تعذر حفظ تفضيلات الإشعارات.' : 'Unable to save notification preferences.');
    } finally {
      setSavingFamily(null);
    }
  }

  return (
    <div className="account-stack">
      <section className="seller-session-panel">
        <div className="section-heading-row">
          <div>
            <div className="eyebrow">{ar ? 'صندوق الإشعارات' : 'Notification inbox'}</div>
            <h2>{ar ? `${unreadCount} غير مقروء` : `${unreadCount} unread`}</h2>
          </div>
          <div className="actions">
            <button className="button-secondary" type="button" onClick={() => void load()} disabled={loading}>
              {ar ? 'تحديث' : 'Refresh'}
            </button>
            <button className="button-primary" type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
              {ar ? 'تعليم الكل كمقروء' : 'Mark all read'}
            </button>
          </div>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}
        {loading ? <p>{ar ? 'جارٍ تحميل الإشعارات…' : 'Loading notifications…'}</p> : null}
        {!loading && notifications.length === 0 ? (
          <p>{ar ? 'لا توجد إشعارات حتى الآن.' : 'No notifications yet.'}</p>
        ) : null}

        <div className="orders-list">
          {notifications.map((notification) => (
            <article className="trade-note-card" key={notification.id}>
              <div className="section-heading-row">
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <small>
                    {new Intl.DateTimeFormat(ar ? 'ar' : 'en', {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    }).format(new Date(notification.createdAt))}
                  </small>
                </div>
                {notification.readAt ? (
                  <span>{ar ? 'مقروء' : 'Read'}</span>
                ) : (
                  <button className="button-secondary" type="button" onClick={() => void markRead(notification)}>
                    {ar ? 'تعليم كمقروء' : 'Mark read'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="seller-session-panel">
        <div className="eyebrow">{ar ? 'قنوات الإشعارات' : 'Notification channels'}</div>
        <h2>{ar ? 'اختر القنوات لكل نوع حدث' : 'Choose channels by event type'}</h2>
        <p>
          {ar
            ? 'تبقى إشعارات التطبيق متاحة دائماً. الرسائل في المحادثات المكتومة لا تُرسل بالبريد أو الإشعارات الفورية.'
            : 'In-app notifications always remain available. Messages in muted conversations do not fan out to email or push.'}
        </p>
        <div className="orders-list">
          {preferences.map((preference) => {
            const label = familyLabels[preference.eventFamily];
            const saving = savingFamily === preference.eventFamily;
            return (
              <article className="trade-note-card" key={preference.eventFamily}>
                <strong>{label ? (ar ? label.ar : label.en) : preference.eventFamily}</strong>
                <div className="actions">
                  <label>
                    <input
                      type="checkbox"
                      checked={preference.emailEnabled}
                      disabled={saving}
                      onChange={(event) => void changePreference(preference, 'emailEnabled', event.target.checked)}
                    />{' '}
                    {ar ? 'البريد الإلكتروني' : 'Email'}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={preference.smsEnabled}
                      disabled={saving}
                      onChange={(event) => void changePreference(preference, 'smsEnabled', event.target.checked)}
                    />{' '}
                    {ar ? 'رسائل SMS' : 'SMS'}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={preference.pushEnabled}
                      disabled={saving}
                      onChange={(event) => void changePreference(preference, 'pushEnabled', event.target.checked)}
                    />{' '}
                    {ar ? 'الإشعارات الفورية' : 'Push'}
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
