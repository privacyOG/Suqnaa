'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthed, postAuthed } from '../lib/authed-api';

type Locale = 'en' | 'ar';

type AccessPayload = {
  userId?: string;
  permissions?: string[];
};

type PolicyRule = {
  id: string;
  scope: string;
  categoryId: string | null;
  categorySlug: string | null;
  pattern: string | null;
  action: string;
  reasonCode: string;
  note: string | null;
  active: boolean;
  updatedAt: string;
};

type ModerationAction = {
  id: string;
  reportId: string | null;
  listingId: string | null;
  userId: string | null;
  actionType: string;
  source: string;
  reasonCode: string;
  reason: string;
  status: string;
  evidenceRetainUntil: string;
  evidencePurgedAt: string | null;
  createdAt: string;
};

type ModerationAppeal = {
  id: string;
  moderationActionId: string;
  appellantUserId: string;
  status: string;
  reason: string;
  decision: string | null;
  decisionNote: string | null;
  openedAt: string;
  actionType: string;
  listingId: string | null;
  userId: string | null;
};

function text(locale: Locale, en: string, ar: string) {
  return locale === 'ar' ? ar : en;
}

function short(value: string | null | undefined) {
  if (!value) return '—';
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function OperationsModerationPanel({ locale }: { locale: Locale }) {
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reasonCode, setReasonCode] = useState('moderation.policy');
  const [reason, setReason] = useState('');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleAction, setRuleAction] = useState<'block' | 'manual_review'>('manual_review');

  const canPolicy = permissions.has('moderation.policy.manage');
  const canListings = permissions.has('moderation.listing.manage');
  const canAccounts = permissions.has('moderation.account.manage');
  const canAppeals = permissions.has('moderation.appeal.review');
  const canRead = permissions.has('moderation.queue.read') || canListings || canAccounts || canAppeals || canPolicy;

  const refresh = useCallback(async () => {
    try {
      const access = await getAuthed<AccessPayload>('/v1/operations/access/me');
      const nextPermissions = new Set(access.permissions ?? []);
      setPermissions(nextPermissions);
      const jobs: Promise<void>[] = [];
      if (nextPermissions.has('moderation.policy.manage')) {
        jobs.push(getAuthed<{ rules: PolicyRule[] }>('/v1/operations/moderation/policy-rules').then((value) => setRules(value.rules)));
      }
      if (
        nextPermissions.has('moderation.queue.read') || nextPermissions.has('moderation.listing.manage') ||
        nextPermissions.has('moderation.account.manage') || nextPermissions.has('moderation.appeal.review')
      ) {
        jobs.push(getAuthed<{ actions: ModerationAction[] }>('/v1/operations/moderation/actions?limit=100').then((value) => setActions(value.actions)));
      }
      if (nextPermissions.has('moderation.appeal.review')) {
        jobs.push(getAuthed<{ appeals: ModerationAppeal[] }>('/v1/operations/moderation/appeals?limit=100').then((value) => setAppeals(value.appeals)));
      }
      await Promise.all(jobs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load moderation data');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setMessage(success);
      setReason('');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Moderation request failed');
    } finally {
      setBusy(false);
    }
  }

  const openAppeals = useMemo(() => appeals.filter((appeal) => appeal.status === 'open'), [appeals]);

  if (!canRead && permissions.size > 0) {
    return <p>{text(locale, 'You do not have moderation permissions.', 'لا تملك صلاحيات الإشراف.')}</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {message ? <p role="status">{message}</p> : null}

      {(canListings || canAccounts) ? (
        <section className="seller-session-panel">
          <h2>{text(locale, 'Direct moderation action', 'إجراء إشراف مباشر')}</h2>
          <p>{text(locale, 'Actions are durable, audited, appealable where applicable, and retain a bounded evidence snapshot.', 'الإجراءات دائمة ومدققة وقابلة للاستئناف عند انطباق ذلك، مع نسخة أدلة محدودة المدة.')}</p>
          <label>{text(locale, 'Listing or account UUID', 'معرّف الإعلان أو الحساب')}
            <input value={targetId} onChange={(event) => setTargetId(event.target.value.trim())} />
          </label>
          <label>{text(locale, 'Reason code', 'رمز السبب')}
            <input value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} />
          </label>
          <label>{text(locale, 'Reason', 'السبب')}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {canListings ? <>
              <button disabled={busy || !targetId || reason.trim().length < 8} onClick={() => void run(
                () => postAuthed(`/v1/operations/moderation/listings/${targetId}/action`, { action: 'approve', reasonCode, reason }),
                text(locale, 'Listing approved.', 'تمت الموافقة على الإعلان.')
              )}>{text(locale, 'Approve listing', 'الموافقة على الإعلان')}</button>
              <button disabled={busy || !targetId || reason.trim().length < 8} onClick={() => void run(
                () => postAuthed(`/v1/operations/moderation/listings/${targetId}/action`, { action: 'takedown', reasonCode, reason }),
                text(locale, 'Listing taken down.', 'تمت إزالة الإعلان.')
              )}>{text(locale, 'Take down listing', 'إزالة الإعلان')}</button>
            </> : null}
            {canAccounts ? <>
              <button disabled={busy || !targetId || reason.trim().length < 8} onClick={() => void run(
                () => postAuthed(`/v1/operations/moderation/accounts/${targetId}/action`, { action: 'suspend', reasonCode, reason }),
                text(locale, 'Account suspended.', 'تم تعليق الحساب.')
              )}>{text(locale, 'Suspend account', 'تعليق الحساب')}</button>
              <button disabled={busy || !targetId || reason.trim().length < 8} onClick={() => void run(
                () => postAuthed(`/v1/operations/moderation/accounts/${targetId}/action`, { action: 'close', reasonCode, reason }),
                text(locale, 'Account closed.', 'تم إغلاق الحساب.')
              )}>{text(locale, 'Close account', 'إغلاق الحساب')}</button>
            </> : null}
          </div>
        </section>
      ) : null}

      {canPolicy ? (
        <section className="seller-session-panel">
          <h2>{text(locale, 'Listing-text policy rules', 'قواعد نص الإعلان')}</h2>
          <p>{text(locale, 'Create exact normalized phrase rules. Category rules remain available through the API and category administration workflow.', 'أنشئ قواعد لعبارات مطبّعة مطابقة. تبقى قواعد الفئات متاحة عبر واجهة البرمجة ومسار إدارة الفئات.')}</p>
          <label>{text(locale, 'Phrase', 'العبارة')}
            <input value={rulePattern} onChange={(event) => setRulePattern(event.target.value)} />
          </label>
          <label>{text(locale, 'Outcome', 'النتيجة')}
            <select value={ruleAction} onChange={(event) => setRuleAction(event.target.value as 'block' | 'manual_review')}>
              <option value="manual_review">manual_review</option>
              <option value="block">block</option>
            </select>
          </label>
          <button disabled={busy || rulePattern.trim().length < 2} onClick={() => void run(
            () => postAuthed('/v1/operations/moderation/policy-rules', {
              scope: 'listing_text', pattern: rulePattern.trim(), action: ruleAction,
              reasonCode: ruleAction === 'block' ? 'policy.prohibited_text' : 'policy.manual_review'
            }),
            text(locale, 'Policy rule created.', 'تم إنشاء قاعدة السياسة.')
          )}>{text(locale, 'Create rule', 'إنشاء قاعدة')}</button>
          <div style={{ overflowX: 'auto' }}><table><thead><tr><th>{text(locale, 'Target', 'الهدف')}</th><th>{text(locale, 'Outcome', 'النتيجة')}</th><th>{text(locale, 'Reason', 'السبب')}</th><th>{text(locale, 'Active', 'نشط')}</th><th /></tr></thead><tbody>
            {rules.map((rule) => <tr key={rule.id}><td>{rule.categorySlug ?? rule.pattern ?? short(rule.categoryId)}</td><td>{rule.action}</td><td>{rule.reasonCode}</td><td>{String(rule.active)}</td><td><button disabled={busy} onClick={() => void run(
              () => postAuthed(`/v1/operations/moderation/policy-rules/${rule.id}/status`, { active: !rule.active }),
              text(locale, 'Policy rule updated.', 'تم تحديث قاعدة السياسة.')
            )}>{rule.active ? text(locale, 'Disable', 'تعطيل') : text(locale, 'Enable', 'تفعيل')}</button></td></tr>)}
          </tbody></table></div>
        </section>
      ) : null}

      <section className="seller-session-panel">
        <h2>{text(locale, 'Moderation actions', 'إجراءات الإشراف')}</h2>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>{text(locale, 'Action', 'الإجراء')}</th><th>{text(locale, 'Subject', 'الموضوع')}</th><th>{text(locale, 'Status', 'الحالة')}</th><th>{text(locale, 'Source', 'المصدر')}</th><th>{text(locale, 'Retention', 'الاحتفاظ')}</th></tr></thead><tbody>
          {actions.map((action) => <tr key={action.id}><td>{action.actionType}<br /><small>{short(action.id)}</small></td><td>{short(action.listingId ?? action.userId)}</td><td>{action.status}</td><td>{action.source}</td><td>{action.evidencePurgedAt ? text(locale, 'purged', 'تم الحذف') : new Date(action.evidenceRetainUntil).toLocaleDateString(locale)}</td></tr>)}
        </tbody></table></div>
      </section>

      {canAppeals ? (
        <section className="seller-session-panel">
          <h2>{text(locale, 'Open appeals', 'الاستئنافات المفتوحة')}</h2>
          {openAppeals.length === 0 ? <p>{text(locale, 'No open moderation appeals.', 'لا توجد استئنافات إشراف مفتوحة.')}</p> : openAppeals.map((appeal) => (
            <article key={appeal.id} style={{ borderTop: '1px solid currentColor', paddingTop: 12, marginTop: 12 }}>
              <p><strong>{appeal.actionType}</strong> · {short(appeal.listingId ?? appeal.userId)} · {appeal.reason}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['uphold', 'overturn', 'dismiss'] as const).map((decision) => <button key={decision} disabled={busy} onClick={() => void run(
                  () => postAuthed(`/v1/operations/moderation/appeals/${appeal.id}/decision`, {
                    decision,
                    note: reason.trim().length >= 8 ? reason.trim() : `Moderation appeal ${decision} decision.`
                  }),
                  text(locale, `Appeal ${decision} recorded.`, `تم تسجيل قرار الاستئناف: ${decision}.`)
                )}>{decision}</button>)}
              </div>
            </article>
          ))}
          <button disabled={busy} onClick={() => void run(
            () => postAuthed('/v1/operations/moderation/reconcile-retention', {}),
            text(locale, 'Retention reconciliation completed.', 'اكتملت تسوية الاحتفاظ.')
          )}>{text(locale, 'Reconcile expired evidence', 'تسوية الأدلة منتهية المدة')}</button>
        </section>
      ) : null}
    </div>
  );
}
