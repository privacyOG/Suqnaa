import { isLocale } from '../../../../i18n/locales';
import { loadOperationsFulfilment } from '../../../../lib/operations-review-server';

function when(value: string | null, locale: string): string {
  return value ? new Date(value).toLocaleString(locale === 'ar' ? 'ar-AU' : 'en-AU') : '—';
}

export default async function OperationsFulfilmentPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const ar = params.locale === 'ar';
  const data = await loadOperationsFulfilment();

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links"><a href={`/${params.locale}/operations`}>{ar ? 'لوحة الإدارة' : 'Administration'}</a></div>
      </nav>
      <section className="catalog-header"><div>
        <span className="buyer-action-label">{ar ? 'مراجعة محمية' : 'Protected review'}</span>
        <h1>{ar ? 'التسليم والإرجاع' : 'Fulfilment & returns'}</h1>
        <p>{ar ? 'مراجعة حالة التسليم والإرجاع دون تغيير مسار النزاعات أو تفويض الدفع.' : 'Review fulfilment and return state without bypassing dispute or payment authorisation workflows.'}</p>
      </div></section>
      {!data ? <p>{ar ? 'غير متاح أو لا توجد صلاحية.' : 'Unavailable or not authorised.'}</p> : <>
        <section className="seller-session-panel">
          <h2>{ar ? 'عمليات التسليم الأخيرة' : 'Recent fulfilments'}</h2>
          <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'الإعلان' : 'Listing'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'حالة الدفع' : 'Payment'}</th><th>{ar ? 'الناقل' : 'Carrier'}</th><th>{ar ? 'التتبع' : 'Tracking'}</th><th>{ar ? 'آخر تحديث' : 'Updated'}</th>
          </tr></thead><tbody>{data.fulfilments.map((row) => <tr key={row.id}>
            <td>{row.listingTitle ?? row.orderId ?? '—'}</td><td>{row.status}</td><td>{row.paymentStatus}</td><td>{row.carrier ?? '—'}</td><td>{row.trackingReference ?? '—'}</td><td>{when(row.updatedAt, params.locale)}</td>
          </tr>)}</tbody></table></div>
        </section>
        <section className="seller-session-panel">
          <h2>{ar ? 'الإرجاعات الأخيرة' : 'Recent returns'}</h2>
          <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'الإعلان' : 'Listing'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'سبب الإرجاع' : 'Reason'}</th><th>{ar ? 'الموعد النهائي' : 'Due'}</th><th>{ar ? 'حالة السلعة' : 'Seller condition'}</th>
          </tr></thead><tbody>{data.returns.map((row) => <tr key={row.id}>
            <td>{row.listingTitle ?? row.orderId}</td><td>{row.status}</td><td>{row.reason}</td><td>{when(row.returnDueAt, params.locale)}</td><td>{row.sellerCondition ?? '—'}</td>
          </tr>)}</tbody></table></div>
        </section>
      </>}
    </main>
  );
}
