'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAdministrativeAccess } from '../lib/operations-access-api';
import { decidePaymentOperation, runSellerSettlements } from '../lib/operations-finance-api';

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? '' : String(value);
}

export function OperationsFinanceActions({
  locale,
  operations
}: {
  locale: string;
  operations: Array<Record<string, unknown>>;
}) {
  const ar = locale === 'ar';
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    getAdministrativeAccess()
      .then((access) => {
        if (!active) return;
        setPermissions(new Set(access.permissions));
        setUserId(access.userId);
      })
      .catch(() => {
        if (active) setMessage(ar ? 'تعذر تحميل صلاحيات الإدارة.' : 'Could not load administration permissions.');
      });
    return () => { active = false; };
  }, [ar]);

  const requested = useMemo(
    () => operations.filter((row) => (localStatuses[text(row, 'id')] ?? text(row, 'status')) === 'requested'),
    [operations, localStatuses]
  );
  const canApprove = permissions.has('payments.approve');
  const canRunSettlements = permissions.has('settlements.run');

  async function decide(row: Record<string, unknown>, decision: 'approve' | 'reject') {
    const id = text(row, 'id');
    const reason = (reasons[id] ?? '').trim();
    if (reason.length < 8) {
      setMessage(ar ? 'أدخل سبباً لا يقل عن 8 أحرف.' : 'Enter a reason of at least 8 characters.');
      return;
    }
    setBusy(id);
    setMessage('');
    try {
      const result = await decidePaymentOperation(id, { decision, reason });
      const status = result.status ?? (decision === 'reject' ? 'rejected' : 'approved');
      setLocalStatuses((current) => ({ ...current, [id]: status }));
      setMessage(ar ? `تم تسجيل القرار: ${status}` : `Decision recorded: ${status}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (ar ? 'فشل قرار عملية الدفع.' : 'Payment-operation decision failed.'));
    } finally {
      setBusy(null);
    }
  }

  async function runSettlements() {
    setBusy('settlements');
    setMessage('');
    try {
      const result = await runSellerSettlements(50);
      setMessage(ar
        ? `اكتملت دفعة التسويات. التحويلات: ${String(result.processedTransfers ?? 0)}، العكس: ${String(result.processedReversals ?? 0)}`
        : `Settlement batch completed. Transfers: ${String(result.processedTransfers ?? 0)}, reversals: ${String(result.processedReversals ?? 0)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (ar ? 'فشل تشغيل التسويات.' : 'Settlement run failed.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="seller-session-panel" aria-labelledby="finance-actions-heading">
      <h2 id="finance-actions-heading">{ar ? 'إجراءات مالية مخولة' : 'Authorised finance actions'}</h2>
      <p>{ar
        ? 'لا تظهر الموافقات إلا لصلاحية payments.approve، ولا يمكن للمستخدم اعتماد العملية التي طلبها بنفسه. تشغيل التسويات يتطلب settlements.run.'
        : 'Decisions require payments.approve, and an operator cannot approve an operation they requested themselves. Settlement execution requires settlements.run.'}</p>

      {canApprove ? (
        requested.length === 0 ? <p>{ar ? 'لا توجد عمليات دفع بانتظار القرار.' : 'No payment operations are awaiting a decision.'}</p> : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {requested.map((row) => {
              const id = text(row, 'id');
              const requestedBy = text(row, 'requested_by');
              const selfRequested = Boolean(userId && requestedBy && requestedBy === userId);
              return (
                <div key={id} className="seller-session-panel">
                  <strong>{text(row, 'kind')} · {text(row, 'order_id')}</strong>
                  <p>{text(row, 'amount') || '—'} {text(row, 'currency_code')} · {text(row, 'reason')}</p>
                  {selfRequested ? <p><small>{ar ? 'يجب أن يتخذ مستخدم آخر مخول القرار.' : 'A different authorised operator must decide this request.'}</small></p> : null}
                  <label>
                    {ar ? 'سبب القرار' : 'Decision reason'}
                    <textarea
                      value={reasons[id] ?? ''}
                      onChange={(event) => setReasons((current) => ({ ...current, [id]: event.target.value }))}
                      maxLength={2000}
                      disabled={selfRequested || busy === id}
                    />
                  </label>
                  <div className="actions">
                    <button type="button" onClick={() => void decide(row, 'approve')} disabled={selfRequested || busy !== null}>
                      {ar ? 'اعتماد' : 'Approve'}
                    </button>
                    <button type="button" className="button-secondary" onClick={() => void decide(row, 'reject')} disabled={selfRequested || busy !== null}>
                      {ar ? 'رفض' : 'Reject'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : <p><small>{ar ? 'لا تملك صلاحية اعتماد عمليات الدفع.' : 'You do not have payment approval permission.'}</small></p>}

      <hr />
      {canRunSettlements ? (
        <button type="button" onClick={() => void runSettlements()} disabled={busy !== null}>
          {busy === 'settlements' ? (ar ? 'جارٍ التشغيل…' : 'Running…') : (ar ? 'تشغيل دفعة تسويات' : 'Run settlement batch')}
        </button>
      ) : <p><small>{ar ? 'لا تملك صلاحية تشغيل التسويات.' : 'You do not have settlement execution permission.'}</small></p>}

      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
