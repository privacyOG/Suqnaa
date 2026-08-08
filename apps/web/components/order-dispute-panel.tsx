'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  type DisputeCategory,
  type DisputeDetail,
  type DisputeSummary,
  addTextDisputeEvidence,
  appealDispute,
  listDisputes,
  openDispute,
  protectedEvidenceHref,
  readDispute,
  respondToDispute,
  uploadDisputeEvidence
} from '../lib/dispute-api';

const categories: DisputeCategory[] = ['non_delivery', 'item_condition', 'damage', 'pickup_issue', 'payment_issue', 'other'];

function label(value: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    non_delivery: ['Non-delivery', 'عدم التسليم'],
    item_condition: ['Item condition', 'حالة السلعة'],
    damage: ['Damage', 'تلف'],
    pickup_issue: ['Pickup issue', 'مشكلة الاستلام'],
    payment_issue: ['Payment issue', 'مشكلة الدفع'],
    other: ['Other', 'أخرى'],
    awaiting_buyer: ['Awaiting buyer', 'بانتظار المشتري'],
    awaiting_seller: ['Awaiting seller', 'بانتظار البائع'],
    under_review: ['Under review', 'قيد المراجعة'],
    resolved: ['Resolved', 'تم الحل'],
    closed: ['Closed', 'مغلق'],
    buyer_refund: ['Buyer refund requested', 'طلب استرداد للمشتري'],
    seller_release: ['Seller release requested', 'طلب تحرير للبائع'],
    partial_refund: ['Partial refund requested', 'طلب استرداد جزئي'],
    return_required: ['Return required', 'الإرجاع مطلوب'],
    compliance_escalation: ['Compliance escalation', 'تصعيد للامتثال'],
    none: ['No decision yet', 'لا يوجد قرار بعد']
  };
  return labels[value]?.[ar ? 1 : 0] ?? value.replaceAll('_', ' ');
}

export function OrderDisputePanel({ locale, orderId }: { locale: string; orderId: string }) {
  const ar = locale === 'ar';
  const [cases, setCases] = useState<DisputeSummary[]>([]);
  const [detail, setDetail] = useState<DisputeDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<DisputeCategory>('non_delivery');
  const [reason, setReason] = useState('');
  const [response, setResponse] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const current = useMemo(() => cases.find((item) => item.orderId === orderId) ?? null, [cases, orderId]);

  const refresh = useCallback(async () => {
    const result = await listDisputes();
    const orderCases = result.disputes.filter((item) => item.orderId === orderId);
    setCases(orderCases);
    const selected = orderCases[0];
    setDetail(selected ? await readDispute(selected.id) : null);
  }, [orderId]);

  useEffect(() => { void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))); }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function submitOpen(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await openDispute({ orderId, category, reason });
      setReason('');
    });
  }

  return (
    <section className="seller-session-panel" aria-labelledby="order-dispute-heading">
      <div className="eyebrow">{ar ? 'حماية المعاملة' : 'Transaction protection'}</div>
      <h2 id="order-dispute-heading">{ar ? 'النزاعات' : 'Disputes'}</h2>
      <p>
        {ar
          ? 'يوقف النزاع النشط تسوية البائع أثناء المراجعة. أي استرداد أو تحرير أموال يحتاج إلى تفويض دفع منفصل.'
          : 'An active dispute blocks seller settlement while it is reviewed. Any refund or fund release still requires separate payment authorization.'}
      </p>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {!current ? (
        <form onSubmit={submitOpen} className="seller-form">
          <label>
            {ar ? 'نوع النزاع' : 'Dispute type'}
            <select value={category} onChange={(event) => setCategory(event.target.value as DisputeCategory)} disabled={busy}>
              {categories.map((item) => <option key={item} value={item}>{label(item, ar)}</option>)}
            </select>
          </label>
          <label>
            {ar ? 'اشرح المشكلة' : 'Describe the problem'}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={20} maxLength={4000} required disabled={busy} />
          </label>
          <button className="button-primary" type="submit" disabled={busy || reason.trim().length < 20}>
            {ar ? 'فتح نزاع' : 'Open dispute'}
          </button>
        </form>
      ) : detail ? (
        <div className="seller-form">
          <p><strong>{ar ? 'الحالة:' : 'Status:'}</strong> {label(detail.dispute.status, ar)}</p>
          <p><strong>{ar ? 'النوع:' : 'Category:'}</strong> {label(detail.dispute.category, ar)}</p>
          <p>{detail.dispute.reason}</p>
          <p><strong>{ar ? 'المهلة للرد:' : 'Response due:'}</strong> {new Date(detail.dispute.responseDueAt).toLocaleString(ar ? 'ar-AU' : 'en-AU')}</p>
          {detail.dispute.outcome !== 'none' ? <p><strong>{ar ? 'النتيجة:' : 'Outcome:'}</strong> {label(detail.dispute.outcome, ar)}</p> : null}
          {detail.paymentOperation ? (
            <p>{ar ? 'إجراء الدفع المرتبط:' : 'Linked payment operation:'} {detail.paymentOperation.kind} · {detail.paymentOperation.status}</p>
          ) : null}

          {detail.responses.length ? <div>
            <h3>{ar ? 'الردود' : 'Responses'}</h3>
            {detail.responses.map((item) => <p key={item.id}>{item.responseText}</p>)}
          </div> : null}

          {!['resolved', 'closed'].includes(detail.dispute.status) ? <form onSubmit={(event) => {
            event.preventDefault();
            void run(async () => { await respondToDispute(detail.dispute.id, response); setResponse(''); });
          }}>
            <label>{ar ? 'إضافة رد' : 'Add response'}<textarea value={response} onChange={(event) => setResponse(event.target.value)} minLength={10} maxLength={6000} required disabled={busy} /></label>
            <button className="button-secondary" type="submit" disabled={busy || response.trim().length < 10}>{ar ? 'إرسال الرد' : 'Submit response'}</button>
          </form> : null}

          <form onSubmit={(event) => {
            event.preventDefault();
            void run(async () => { await addTextDisputeEvidence(detail.dispute.id, { evidenceType: 'participant_statement', text: evidenceText }); setEvidenceText(''); });
          }}>
            <label>{ar ? 'دليل نصي' : 'Text evidence'}<textarea value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} minLength={3} maxLength={10000} required disabled={busy} /></label>
            <button className="button-secondary" type="submit" disabled={busy || evidenceText.trim().length < 3}>{ar ? 'إضافة الدليل' : 'Add evidence'}</button>
          </form>

          <form onSubmit={(event) => {
            event.preventDefault();
            if (!file) return;
            void run(async () => { await uploadDisputeEvidence(detail.dispute.id, { evidenceType: 'participant_file', file }); setFile(null); });
          }}>
            <label>{ar ? 'ملف دليل خاص (JPG/PNG/WebP/PDF، حتى 10MB)' : 'Private evidence file (JPG/PNG/WebP/PDF, up to 10MB)'}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={busy} />
            </label>
            <button className="button-secondary" type="submit" disabled={busy || !file}>{ar ? 'رفع الملف' : 'Upload file'}</button>
          </form>

          {detail.evidence.length ? <div>
            <h3>{ar ? 'الأدلة' : 'Evidence'}</h3>
            <ul>
              {detail.evidence.map((item) => <li key={item.id}>
                {item.textValue ?? item.filename ?? item.type}
                {item.downloadPath ? <> · <a href={protectedEvidenceHref(item.downloadPath)}>{ar ? 'تنزيل خاص' : 'Private download'}</a></> : null}
              </li>)}
            </ul>
          </div> : null}

          {detail.dispute.status === 'resolved' && !detail.appeal && detail.dispute.appealDeadlineAt && new Date(detail.dispute.appealDeadlineAt) > new Date() ? (
            <form onSubmit={(event) => {
              event.preventDefault();
              void run(async () => { await appealDispute(detail.dispute.id, appealReason); setAppealReason(''); });
            }}>
              <label>{ar ? 'سبب الاستئناف' : 'Appeal reason'}<textarea value={appealReason} onChange={(event) => setAppealReason(event.target.value)} minLength={20} maxLength={4000} required disabled={busy} /></label>
              <button className="button-secondary" type="submit" disabled={busy || appealReason.trim().length < 20}>{ar ? 'تقديم استئناف' : 'Submit appeal'}</button>
            </form>
          ) : null}

          {detail.appeal ? <p><strong>{ar ? 'الاستئناف:' : 'Appeal:'}</strong> {detail.appeal.status}</p> : null}
        </div>
      ) : <p>{ar ? 'جارٍ تحميل النزاع…' : 'Loading dispute…'}</p>}
    </section>
  );
}
