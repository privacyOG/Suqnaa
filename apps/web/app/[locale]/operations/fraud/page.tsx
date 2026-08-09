import { isLocale } from '../../../../i18n/locales';
import { OperationsRiskPanel } from '../../../../components/operations-risk-panel';
import { loadOperationsFraud } from '../../../../lib/operations-review-server';

export default async function OperationsFraudPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const ar = params.locale === 'ar';
  const data = await loadOperationsFraud();

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links"><a href={`/${params.locale}/operations`}>{ar ? 'لوحة الإدارة' : 'Administration'}</a></div>
      </nav>
      <section className="catalog-header"><div>
        <span className="buyer-action-label">{ar ? 'مراجعة المخاطر الآلية' : 'Automated risk review'}</span>
        <h1>{ar ? 'إشارات المخاطر والاحتيال' : 'Risk and fraud signals'}</h1>
        <p>{ar ? 'يعرض هذا القسم إشارات المخاطر الدائمة المكتشفة آلياً، مع بلاغات الاحتيال وعمليات رد المبالغ المتاحة حسب صلاحيات المشغّل. الإشارة لا تنفذ تعليق الحساب أو إزالة الإعلان أو تحريك الأموال تلقائياً.' : 'This view surfaces persisted automated risk signals together with fraud-labelled reports and chargebacks available to the operator. A risk signal never directly suspends an account, removes a listing, or moves money.'}</p>
      </div></section>
      {!data ? <p>{ar ? 'غير متاح أو لا توجد صلاحية risk.read.' : 'Unavailable or risk.read is not authorised.'}</p> : <>
        <section className="seller-session-panel">
          <h2>{ar ? 'إشارات المخاطر الدائمة' : 'Persisted risk signals'}</h2>
          {data.signals.length === 0 ? <p>{ar ? 'لا توجد إشارات مخاطر حالية.' : 'No risk signals have been recorded.'}</p> : <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'القاعدة' : 'Rule'}</th><th>{ar ? 'الفئة' : 'Category'}</th><th>{ar ? 'الخطورة' : 'Severity'}</th><th>{ar ? 'الدرجة' : 'Score'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'التكرار' : 'Occurrences'}</th><th>{ar ? 'الملخص' : 'Summary'}</th><th>{ar ? 'آخر رصد' : 'Last observed'}</th>
          </tr></thead><tbody>{data.signals.map((row) => <tr key={row.id}>
            <td><code>{row.ruleKey}</code></td><td>{row.category}</td><td>{row.severity}</td><td>{row.score}</td><td>{row.status}{row.reviewDisposition ? ` · ${row.reviewDisposition}` : ''}</td><td>{row.occurrenceCount}</td><td>{row.summary}</td><td>{new Date(row.lastObservedAt).toLocaleString(ar ? 'ar-AU' : 'en-AU')}</td>
          </tr>)}</tbody></table></div>}
        </section>
        <OperationsRiskPanel locale={params.locale} />
        <section className="seller-session-panel">
          <h2>{ar ? 'بلاغات احتيال مفتوحة' : 'Open fraud-labelled reports'}</h2>
          {data.reports.length === 0 ? <p>{ar ? 'لا توجد بلاغات حالية أو لا توجد صلاحية.' : 'No current reports, or report access is not authorised.'}</p> : <ul>{data.reports.map((row) => <li key={row.id}>
            <strong>{row.reason}</strong> · {new Date(row.createdAt).toLocaleString(ar ? 'ar-AU' : 'en-AU')}<br />
            {row.details ?? (ar ? 'لا توجد تفاصيل إضافية' : 'No additional details')}
          </li>)}</ul>}
        </section>
        <section className="seller-session-panel">
          <h2>{ar ? 'عمليات رد المبالغ' : 'Chargebacks'}</h2>
          {data.chargebacks.length === 0 ? <p>{ar ? 'لا توجد عمليات أو لا توجد صلاحية مدفوعات.' : 'No chargebacks, or payment access is not authorised.'}</p> : <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'الطلب' : 'Order'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'المبلغ' : 'Amount'}</th><th>{ar ? 'السبب' : 'Reason'}</th><th>{ar ? 'التاريخ' : 'Date'}</th>
          </tr></thead><tbody>{data.chargebacks.map((row) => <tr key={row.id}>
            <td>{row.orderId}</td><td>{row.status}</td><td>{row.amount ?? '—'} {row.currencyCode}</td><td>{row.reason}</td><td>{new Date(row.requestedAt).toLocaleString(ar ? 'ar-AU' : 'en-AU')}</td>
          </tr>)}</tbody></table></div>}
        </section>
      </>}
    </main>
  );
}
