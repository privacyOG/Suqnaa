import { isLocale } from '../../../../i18n/locales';
import { loadOperationsAccounts } from '../../../../lib/operations-review-server';

export default async function OperationsAccountsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const ar = params.locale === 'ar';
  const data = await loadOperationsAccounts();

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links"><a href={`/${params.locale}/operations`}>{ar ? 'لوحة الإدارة' : 'Administration'}</a></div>
      </nav>
      <section className="catalog-header"><div>
        <span className="buyer-action-label">{ar ? 'إدارة محمية' : 'Protected administration'}</span>
        <h1>{ar ? 'الحسابات' : 'Accounts'}</h1>
        <p>{ar ? 'جرد إداري للحسابات وحالة التحقق والثقة. توسيع سياسات الإيقاف والإغلاق والملاحظات محفوظ لـ P0-29.' : 'Administrative inventory of account, verification, and trust state. Expanded suspension, closure, and moderator-note policy remains P0-29.'}</p>
      </div></section>
      {!data ? <p>{ar ? 'غير متاح أو لا توجد صلاحية.' : 'Unavailable or not authorised.'}</p> : (
        <section className="seller-session-panel">
          <h2>{ar ? 'الحسابات الأخيرة' : 'Recent accounts'}</h2>
          <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'الاسم' : 'Name'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'البريد' : 'Email'}</th><th>{ar ? 'الهاتف' : 'Phone'}</th><th>{ar ? 'الثقة' : 'Trust'}</th><th>{ar ? 'نشاط تجاري' : 'Business'}</th><th>{ar ? 'الدولة' : 'Country'}</th>
          </tr></thead><tbody>{data.accounts.map((row) => <tr key={row.id}>
            <td>{row.displayName}</td><td>{row.status}</td><td>{row.emailVerified ? '✓' : '—'}</td><td>{row.phoneVerified ? '✓' : '—'}</td><td>{row.trustScore ?? '—'}</td><td>{row.business ? (row.businessName ?? (ar ? 'نعم' : 'Yes')) : '—'}</td><td>{row.countryCode ?? '—'}</td>
          </tr>)}</tbody></table></div>
        </section>
      )}
    </main>
  );
}
