'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { protectedEvidenceHref, type DisputeDetail, type DisputeOutcome, type DisputeSummary } from '../lib/dispute-api';
import {
  decideOperationsAppeal,
  listOperationsDisputes,
  readOperationsDispute,
  reconcileOperationsDisputeDeadlines,
  resolveOperationsDispute,
  startDisputeReview
} from '../lib/operations-dispute-api';

const outcomes: Exclude<DisputeOutcome, 'none'>[] = ['buyer_refund', 'seller_release', 'partial_refund', 'return_required', 'compliance_escalation'];

export function OperationsDisputePanel({ locale }: { locale: string }) {
  const ar = locale === 'ar';
  const [items, setItems] = useState<DisputeSummary[]>([]);
  const [detail, setDetail] = useState<DisputeDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Exclude<DisputeOutcome, 'none'>>('buyer_refund');
  const [notes, setNotes] = useState('');
  const [partialAmount, setPartialAmount] = useState('');

  const reload = useCallback(async () => {
    const result = await listOperationsDisputes();
    setItems(result.disputes);
    if (detail) setDetail(await readOperationsDispute(detail.dispute.id));
  }, [detail?.dispute.id]);

  useEffect(() => { void listOperationsDisputes().then((result) => setItems(result.disputes)).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))); }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function select(item: DisputeSummary) {
    setBusy(true); setError(null);
    try { setDetail(await readOperationsDispute(item.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function resolve(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    await run(() => resolveOperationsDispute(detail.dispute.id, {
      outcome,
      resolutionNotes: notes,
      ...(outcome === 'partial_refund' ? { partialRefundAmount: partialAmount } : {})
    }));
    setNotes(''); setPartialAmount('');
  }

  return (
    <section className="seller-session-panel">
      <div className="eyebrow">{ar ? 'مراجعة محمية' : 'Protected review'}</div>
      <h2>{ar ? 'نزاعات السوق' : 'Marketplace disputes'}</h2>
      <p>{ar ? 'قرارات الاسترداد أو تحرير الأموال تنشئ طلب دفع فقط؛ الموافقة النهائية تبقى منفصلة.' : 'Refund or release decisions create a payment request only; final payment approval remains separate.'}</p>
      <div className="actions">
        <button className="button-secondary" disabled={busy} onClick={() => void run(reconcileOperationsDisputeDeadlines)}>{ar ? 'تسوية المهل' : 'Reconcile deadlines'}</button>
        <button className="button-secondary" disabled={busy} onClick={() => void run(async () => {})}>{ar ? 'تحديث' : 'Refresh'}</button>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="operations-grid">
        <div>
          {items.map((item) => (
            <button key={item.id} className="operations-item" type="button" onClick={() => void select(item)} disabled={busy}>
              <strong>{item.category.replaceAll('_', ' ')}</strong><br />
              {item.status.replaceAll('_', ' ')} · {item.orderId.slice(0, 8)}
            </button>
          ))}
        </div>
        {detail ? <div className="seller-form">
          <h3>{detail.dispute.category.replaceAll('_', ' ')}</h3>
          <p><strong>{ar ? 'الحالة:' : 'Status:'}</strong> {detail.dispute.status.replaceAll('_', ' ')}</p>
          <p>{detail.dispute.reason}</p>
          <p><strong>{ar ? 'مهلة الرد:' : 'Response due:'}</strong> {new Date(detail.dispute.responseDueAt).toLocaleString(ar ? 'ar-AU' : 'en-AU')}</p>
          <p><strong>{ar ? 'مهلة المراجعة:' : 'Review due:'}</strong> {new Date(detail.dispute.reviewDueAt).toLocaleString(ar ? 'ar-AU' : 'en-AU')}</p>
          <div className="actions">
            <button className="button-secondary" disabled={busy || ['resolved','closed'].includes(detail.dispute.status)} onClick={() => void run(() => startDisputeReview(detail.dispute.id, null))}>{ar ? 'بدء المراجعة' : 'Start review'}</button>
            <button className="button-secondary" disabled={busy || ['resolved','closed'].includes(detail.dispute.status)} onClick={() => void run(() => startDisputeReview(detail.dispute.id, 'buyer', 'Additional buyer information requested by dispute review.'))}>{ar ? 'طلب معلومات من المشتري' : 'Request buyer info'}</button>
            <button className="button-secondary" disabled={busy || ['resolved','closed'].includes(detail.dispute.status)} onClick={() => void run(() => startDisputeReview(detail.dispute.id, 'seller', 'Additional seller information requested by dispute review.'))}>{ar ? 'طلب معلومات من البائع' : 'Request seller info'}</button>
          </div>
          {detail.responses.length ? <div><h4>{ar ? 'الردود' : 'Responses'}</h4>{detail.responses.map((entry) => <p key={entry.id}>{entry.responseText}</p>)}</div> : null}
          {detail.evidence.length ? <div><h4>{ar ? 'الأدلة' : 'Evidence'}</h4><ul>{detail.evidence.map((entry) => <li key={entry.id}>
            {entry.textValue ?? entry.filename ?? entry.type}
            {entry.downloadPath ? <> · <a href={protectedEvidenceHref(entry.downloadPath)}>{ar ? 'تنزيل الدليل الخاص' : 'Download private evidence'}</a></> : null}
          </li>)}</ul></div> : null}
          {!['resolved','closed'].includes(detail.dispute.status) ? <form onSubmit={resolve}>
            <label>{ar ? 'النتيجة' : 'Outcome'}<select value={outcome} onChange={(event) => setOutcome(event.target.value as Exclude<DisputeOutcome,'none'>)}>{outcomes.map((value) => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
            {outcome === 'partial_refund' ? <label>{ar ? 'مبلغ الاسترداد الجزئي' : 'Partial refund amount'}<input inputMode="decimal" value={partialAmount} onChange={(event) => setPartialAmount(event.target.value)} required /></label> : null}
            <label>{ar ? 'ملاحظات القرار' : 'Resolution notes'}<textarea minLength={8} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} required /></label>
            <button className="button-primary" type="submit" disabled={busy || notes.trim().length < 8}>{ar ? 'تسجيل القرار' : 'Record resolution'}</button>
          </form> : null}
          {detail.appeal && ['pending','under_review','escalated'].includes(detail.appeal.status) ? <div>
            <h4>{ar ? 'مراجعة الاستئناف' : 'Appeal review'}</h4>
            <p>{detail.appeal.reason}</p>
            {(['upheld','rejected','escalated'] as const).map((decision) => <button key={decision} className="button-secondary" disabled={busy} onClick={() => void run(() => decideOperationsAppeal(detail.dispute.id, decision, `Appeal decision: ${decision}. Reviewed against the dispute record and submitted evidence.`))}>{decision.replaceAll('_',' ')}</button>)}
          </div> : null}
          {detail.paymentOperation ? <p><strong>{ar ? 'إجراء الدفع:' : 'Payment operation:'}</strong> {detail.paymentOperation.kind} · {detail.paymentOperation.status}</p> : null}
        </div> : <p>{ar ? 'اختر نزاعاً للمراجعة.' : 'Select a dispute to review.'}</p>}
      </div>
    </section>
  );
}
