'use client';

import { useState } from 'react';
import type { ParticipantModerationAction } from '../lib/moderation-participant-server';

function labelForAction(action: ParticipantModerationAction, isArabic: boolean): string {
  if (action.actionType === 'listing_takedown') return isArabic ? 'إزالة إعلان' : 'Listing takedown';
  if (action.actionType === 'account_suspend') return isArabic ? 'إيقاف الحساب' : 'Account suspension';
  return isArabic ? 'إغلاق الحساب' : 'Account closure';
}

export function ModerationAppealsPanel({
  locale,
  actions
}: {
  locale: string;
  actions: ParticipantModerationAction[];
}) {
  const isArabic = locale === 'ar';
  const [reasonByAction, setReasonByAction] = useState<Record<string, string>>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submitAppeal(actionId: string) {
    const reason = (reasonByAction[actionId] ?? '').trim();
    if (reason.length < 8) {
      setMessage(isArabic ? 'اكتب سبباً لا يقل عن 8 أحرف.' : 'Provide an appeal reason of at least 8 characters.');
      return;
    }

    setBusyActionId(actionId);
    setMessage(null);
    try {
      const response = await fetch(`/api/authed/v1/market/moderation/actions/${actionId}/appeal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? (isArabic ? 'تعذر إرسال الاستئناف.' : 'Unable to submit appeal.'));
        return;
      }
      window.location.reload();
    } catch {
      setMessage(isArabic ? 'تعذر الاتصال بالخدمة.' : 'Unable to contact the service.');
    } finally {
      setBusyActionId(null);
    }
  }

  if (actions.length === 0) {
    return (
      <section className="seller-session-panel">
        <h2>{isArabic ? 'لا توجد إجراءات قابلة للمراجعة' : 'No reviewable moderation actions'}</h2>
        <p>{isArabic ? 'لا توجد حالياً إجراءات إشراف مرتبطة بحسابك تتطلب استئنافاً.' : 'There are currently no moderation actions on your account that require an appeal.'}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="moderation-appeals-heading">
      <h2 id="moderation-appeals-heading">{isArabic ? 'إجراءات الإشراف والاستئنافات' : 'Moderation actions and appeals'}</h2>
      <p>
        {isArabic
          ? 'يمكن استئناف إجراءات الإزالة أو الإيقاف أو الإغلاق خلال نافذة الاستئناف المعروضة. لا تعرض هذه الصفحة ملاحظات المشرف الداخلية أو أدلة المراجعة الخاصة.'
          : 'Takedown, suspension, and closure actions can be appealed within the displayed appeal window. Internal moderator notes and private review evidence are not exposed here.'}
      </p>
      {message ? <p role="status">{message}</p> : null}
      <div className="catalog-grid">
        {actions.map((action) => (
          <article className="seller-session-panel" key={action.id}>
            <div className="eyebrow">{labelForAction(action, isArabic)}</div>
            <h3>{action.listingTitle ?? (isArabic ? 'إجراء على الحساب' : 'Account action')}</h3>
            <p>{action.reason}</p>
            <p><strong>{isArabic ? 'الحالة:' : 'Status:'}</strong> {action.status}</p>
            <p><strong>{isArabic ? 'آخر موعد للاستئناف:' : 'Appeal deadline:'}</strong> {new Date(action.appealDeadline).toLocaleString(isArabic ? 'ar-AU' : 'en-AU')}</p>
            {action.appeal ? (
              <p><strong>{isArabic ? 'الاستئناف:' : 'Appeal:'}</strong> {action.appeal.status}</p>
            ) : action.appealable ? (
              <div>
                <label htmlFor={`appeal-${action.id}`}>{isArabic ? 'سبب الاستئناف' : 'Appeal reason'}</label>
                <textarea
                  id={`appeal-${action.id}`}
                  value={reasonByAction[action.id] ?? ''}
                  onChange={(event) => setReasonByAction((current) => ({ ...current, [action.id]: event.target.value }))}
                  maxLength={4000}
                  rows={4}
                />
                <button
                  className="button-primary"
                  type="button"
                  disabled={busyActionId === action.id}
                  onClick={() => void submitAppeal(action.id)}
                >
                  {busyActionId === action.id
                    ? (isArabic ? 'جارٍ الإرسال…' : 'Submitting…')
                    : (isArabic ? 'إرسال الاستئناف' : 'Submit appeal')}
                </button>
              </div>
            ) : (
              <p>{isArabic ? 'نافذة الاستئناف مغلقة أو لم يعد الإجراء نشطاً.' : 'The appeal window is closed or the action is no longer active.'}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
