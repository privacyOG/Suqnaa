'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthed, postAuthed } from '../lib/authed-api';

type Locale = 'en' | 'ar';
type AccessPayload = { permissions?: string[] };
type RiskRule = {
  id: string; ruleKey: string; category: string; title: string; severity: string;
  score: number; source: string; active: boolean; windowSeconds: number | null;
  thresholdCount: number | null; configuration: Record<string, unknown>;
};
type RiskSignal = {
  id: string; ruleKey: string; category: string; severity: string; score: number;
  status: string; summary: string; occurrenceCount: number; lastObservedAt: string;
};

function text(locale: Locale, en: string, ar: string) { return locale === 'ar' ? ar : en; }

export function OperationsRiskPanel({ locale }: { locale: Locale }) {
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ruleKey, setRuleKey] = useState('');
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('');
  const [category, setCategory] = useState('velocity_anomaly');
  const [severity, setSeverity] = useState('medium');
  const [threshold, setThreshold] = useState(5);
  const [windowSeconds, setWindowSeconds] = useState(900);
  const [reviewNote, setReviewNote] = useState('');

  const canRead = permissions.has('risk.read');
  const canManage = permissions.has('risk.manage');
  const canReview = permissions.has('risk.review');

  const refresh = useCallback(async () => {
    try {
      const access = await getAuthed<AccessPayload>('/v1/operations/access/me');
      const next = new Set(access.permissions ?? []);
      setPermissions(next);
      if (!next.has('risk.read')) return;
      const [ruleData, signalData] = await Promise.all([
        getAuthed<{ rules: RiskRule[] }>('/v1/operations/risk/rules'),
        getAuthed<{ signals: RiskSignal[] }>('/v1/operations/risk/signals?limit=100')
      ]);
      setRules(ruleData.rules);
      setSignals(signalData.signals);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load risk controls');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await work(); setMessage(success); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Risk operation failed'); }
    finally { setBusy(false); }
  }

  const openSignals = useMemo(() => signals.filter((signal) => signal.status === 'open'), [signals]);
  if (!canRead && permissions.size > 0) return <p>{text(locale, 'You do not have risk-review permission.', 'لا تملك صلاحية مراجعة المخاطر.')}</p>;

  return <div style={{ display: 'grid', gap: 24 }}>
    {message ? <p role="status">{message}</p> : null}

    {canManage ? <section className="seller-session-panel">
      <h2>{text(locale, 'Risk rule management', 'إدارة قواعد المخاطر')}</h2>
      <p>{text(locale, 'Rules detect and score activity only. They do not execute moderation, payment, or settlement actions.', 'تكتشف القواعد النشاط وتقيمه فقط، ولا تنفذ إجراءات إشراف أو دفع أو تسوية.')}</p>
      <label>Rule key<input value={ruleKey} onChange={(e) => setRuleKey(e.target.value.trim())} placeholder="offer.custom_velocity" /></label>
      <label>{text(locale, 'Title', 'العنوان')}<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>{text(locale, 'Event type', 'نوع الحدث')}<input value={eventType} onChange={(e) => setEventType(e.target.value.trim())} placeholder="offer.created" /></label>
      <label>{text(locale, 'Category', 'الفئة')}<select value={category} onChange={(e) => setCategory(e.target.value)}>
        {['account_abuse','offer_payment_fraud','account_takeover','velocity_anomaly','duplicate_identity','suspicious_seller'].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>{text(locale, 'Severity', 'الخطورة')}<select value={severity} onChange={(e) => setSeverity(e.target.value)}>{['low','medium','high','critical'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>{text(locale, 'Threshold count', 'حد العدد')}<input type="number" min={1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label>
      <label>{text(locale, 'Window seconds', 'نافذة الثواني')}<input type="number" min={60} value={windowSeconds} onChange={(e) => setWindowSeconds(Number(e.target.value))} /></label>
      <button disabled={busy || ruleKey.length < 3 || title.trim().length < 3 || eventType.length < 3} onClick={() => void run(
        () => postAuthed('/v1/operations/risk/rules', {
          ruleKey, category, title: title.trim(), description: title.trim(), severity,
          score: severity === 'critical' ? 90 : severity === 'high' ? 75 : severity === 'medium' ? 55 : 30,
          windowSeconds, thresholdCount: threshold, thresholdAmount: null,
          eventTypes: [eventType], metric: 'event_count'
        }), text(locale, 'Risk rule created.', 'تم إنشاء قاعدة المخاطر.')
      )}>{text(locale, 'Create rule', 'إنشاء قاعدة')}</button>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button disabled={busy} onClick={() => void run(() => postAuthed('/v1/operations/risk/reconcile-sources', {}), text(locale, 'Risk sources reconciled.', 'تمت مطابقة مصادر المخاطر.'))}>{text(locale, 'Reconcile sources', 'مطابقة المصادر')}</button>
        <button disabled={busy} onClick={() => void run(() => postAuthed('/v1/operations/risk/reconcile-observations', {}), text(locale, 'Expired observations removed.', 'تم حذف الملاحظات المنتهية.'))}>{text(locale, 'Reconcile retention', 'مطابقة الاحتفاظ')}</button>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 12 }}><table><thead><tr><th>{text(locale, 'Rule', 'القاعدة')}</th><th>{text(locale, 'Category', 'الفئة')}</th><th>{text(locale, 'Severity', 'الخطورة')}</th><th>{text(locale, 'Active', 'نشط')}</th><th /></tr></thead><tbody>
        {rules.map((rule) => <tr key={rule.id}><td><code>{rule.ruleKey}</code><br /><small>{rule.source}</small></td><td>{rule.category}</td><td>{rule.severity} · {rule.score}</td><td>{String(rule.active)}</td><td><button disabled={busy} onClick={() => void run(() => postAuthed(`/v1/operations/risk/rules/${rule.id}/status`, { active: !rule.active }), text(locale, 'Risk rule updated.', 'تم تحديث قاعدة المخاطر.'))}>{rule.active ? text(locale, 'Disable', 'تعطيل') : text(locale, 'Enable', 'تفعيل')}</button></td></tr>)}
      </tbody></table></div>
    </section> : null}

    {canReview ? <section className="seller-session-panel">
      <h2>{text(locale, 'Open risk-signal review', 'مراجعة إشارات المخاطر المفتوحة')}</h2>
      <label>{text(locale, 'Optional analyst note', 'ملاحظة المحلل الاختيارية')}<textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} /></label>
      {openSignals.length === 0 ? <p>{text(locale, 'No open signals.', 'لا توجد إشارات مفتوحة.')}</p> : openSignals.map((signal) => <article key={signal.id} style={{ borderTop: '1px solid currentColor', paddingTop: 12, marginTop: 12 }}>
        <p><strong>{signal.ruleKey}</strong> · {signal.severity} · {signal.score}<br />{signal.summary}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(['confirmed','false_positive','monitor','escalated'] as const).map((disposition) => <button key={disposition} disabled={busy} onClick={() => void run(
          () => postAuthed(`/v1/operations/risk/signals/${signal.id}/review`, { disposition, note: reviewNote.trim() || null }),
          text(locale, `Signal marked ${disposition}.`, `تم تصنيف الإشارة: ${disposition}.`)
        )}>{disposition}</button>)}</div>
      </article>)}
    </section> : null}
  </div>;
}
