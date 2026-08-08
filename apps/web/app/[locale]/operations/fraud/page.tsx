import { isLocale } from '../../../../i18n/locales';
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
        <span className="buyer-action-label">{ar ? 'مراجعة المخاطر الحالية' : 'Existing risk review'}</span>
        <h1>{ar ? 'إشارات الاحتيال' : 'Fraud signals'}</h1>
        <p>{ar ? 'يعرض هذا القسم بلاغات الاحتيال الحالية وعمليات رد المبالغ فقط. قواعد المخاطر الآلية مخصصة لـ P0-30.' : 'This view surfaces existing fraud-labelled reports and chargebacks only. Automated risk rules are intentionally reserved for P0-30.'}</p>
      </div></section>
      {!data ? <p>{ar ? 'غير متاح أو لا توجد صلاحية.' : 'Unavailable or not authorised.'}</p> : <>
        <section className="seller-session-panel">
          <h2>{ar ? 'بلاغات احتيال مفتوحة' : 'Open fraud-labelled reports'}</h2>
          {data.reports.length === 0 ? <p>{ar ? 'لا توجد بلاغات حالية.' : 'No current reports.'}</p> : <ul>{data.reports.map((row) => <li key={row.id}>
            <strong>{row.reason}</strong> · {new Date(row.createdAt).toLocaleString(ar ? 'ar-AU' : 'en-AU')}<br />
            {row.details ?? (ar ? 'لا توجد تفاصيل إضافية' : 'No additional details')}
          </li>)}</ul>}
        </section>
        <section className="seller-session-panel">
          <h2>{ar ? 'عمليات رد المبالغ' : 'Chargebacks'}</h2>
          {data.chargebacks.length === 0 ? <p>{ar ? 'لا توجد عمليات.' : 'No chargebacks.'}</p> : <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'الطلب' : 'Order'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'المبلغ' : 'Amount'}</th><th>{ar ? 'السبب' : 'Reason'}</th><th>{ar ? 'التاريخ' : 'Date'}</th>
          </tr></thead><tbody>{data.chargebacks.map((row) => <tr key={row.id}>
            <td>{row.orderId}</td><td>{row.status}</td><td>{row.amount ?? '—'} {row.currencyCode}</td><td>{row.reason}</td><td>{new Date(row.requestedAt).toLocaleString(ar ? 'ar-AU' : 'en-AU')}</td>
          </tr>)}</tbody></table></div>}
        </section>
      </>}
    </main>
  );
}
