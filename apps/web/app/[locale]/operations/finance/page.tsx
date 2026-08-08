import { isLocale } from '../../../../i18n/locales';
import { loadOperationsFinance } from '../../../../lib/operations-review-server';

function value(row: Record<string, unknown>, key: string): string {
  const item = row[key];
  if (item === null || item === undefined) return '—';
  if (item instanceof Date) return item.toISOString();
  if (typeof item === 'object') return JSON.stringify(item);
  return String(item);
}

export default async function OperationsFinancePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const ar = params.locale === 'ar';
  const data = await loadOperationsFinance();

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links"><a href={`/${params.locale}/operations`}>{ar ? 'لوحة الإدارة' : 'Administration'}</a></div>
      </nav>
      <section className="catalog-header"><div>
        <span className="buyer-action-label">{ar ? 'مراجعة مالية محمية' : 'Protected finance review'}</span>
        <h1>{ar ? 'المدفوعات وتسويات البائعين' : 'Payments & seller settlements'}</h1>
        <p>{ar ? 'يعرض طلبات عمليات الدفع والتسويات الحالية. الموافقات المالية تظل خاضعة لصلاحيات الدفع المنفصلة.' : 'Review payment-operation requests and seller settlements. Financial approvals remain governed by separate payment permissions.'}</p>
      </div></section>
      {!data ? <p>{ar ? 'غير متاح أو لا توجد صلاحية.' : 'Unavailable or not authorised.'}</p> : <>
        <section className="seller-session-panel">
          <h2>{ar ? 'عمليات الدفع الأخيرة' : 'Recent payment operations'}</h2>
          <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'الطلب' : 'Order'}</th><th>{ar ? 'النوع' : 'Kind'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'المبلغ' : 'Amount'}</th><th>{ar ? 'السبب' : 'Reason'}</th><th>{ar ? 'وقت الطلب' : 'Requested'}</th>
          </tr></thead><tbody>{data.operations.map((row) => <tr key={value(row, 'id')}>
            <td>{value(row, 'order_id')}</td><td>{value(row, 'kind')}</td><td>{value(row, 'status')}</td><td>{value(row, 'amount')} {value(row, 'currency_code')}</td><td>{value(row, 'reason')}</td><td>{value(row, 'requested_at')}</td>
          </tr>)}</tbody></table></div>
        </section>
        <section className="seller-session-panel">
          <h2>{ar ? 'تسويات البائعين الأخيرة' : 'Recent seller settlements'}</h2>
          <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'الطلب' : 'Order'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'الإجمالي' : 'Gross'}</th><th>{ar ? 'العمولة' : 'Commission'}</th><th>{ar ? 'الصافي' : 'Net'}</th><th>{ar ? 'حساب الدفع' : 'Payout account'}</th>
          </tr></thead><tbody>{data.settlements.map((row) => <tr key={value(row, 'id')}>
            <td>{value(row, 'order_id')}</td><td>{value(row, 'status')}</td><td>{value(row, 'gross_amount')} {value(row, 'currency_code')}</td><td>{value(row, 'commission_amount')}</td><td>{value(row, 'net_amount')}</td><td>{value(row, 'payout_account_status')}</td>
          </tr>)}</tbody></table></div>
        </section>
      </>}
    </main>
  );
}
