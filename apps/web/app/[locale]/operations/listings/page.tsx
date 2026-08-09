import { isLocale } from '../../../../i18n/locales';
import { loadOperationsListings } from '../../../../lib/operations-review-server';

export default async function OperationsListingsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const ar = params.locale === 'ar';
  const data = await loadOperationsListings();

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links"><a href={`/${params.locale}/operations`}>{ar ? 'لوحة الإدارة' : 'Administration'}</a></div>
      </nav>
      <section className="catalog-header"><div>
        <span className="buyer-action-label">{ar ? 'إدارة محمية' : 'Protected administration'}</span>
        <h1>{ar ? 'الإعلانات' : 'Listings'}</h1>
        <p>{ar ? 'جرد إداري لحالة الإعلانات والبائعين والفئات. سياسات الموافقة والمنع والإزالة الموسعة محفوظة لـ P0-29.' : 'Administrative inventory of listing, seller, and category state. Expanded approval, prohibited-item, and takedown policy remains P0-29.'}</p>
      </div></section>
      {!data ? <p>{ar ? 'غير متاح أو لا توجد صلاحية.' : 'Unavailable or not authorised.'}</p> : (
        <section className="seller-session-panel">
          <h2>{ar ? 'الإعلانات الأخيرة' : 'Recent listings'}</h2>
          <div style={{ overflowX: 'auto' }}><table><thead><tr>
            <th>{ar ? 'الإعلان' : 'Listing'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'السعر' : 'Price'}</th><th>{ar ? 'الفئة' : 'Category'}</th><th>{ar ? 'البائع' : 'Seller'}</th><th>{ar ? 'حالة البائع' : 'Seller status'}</th><th>{ar ? 'الموقع' : 'Location'}</th>
          </tr></thead><tbody>{data.listings.map((row) => <tr key={row.id}>
            <td>{row.title}</td><td>{row.status}</td><td>{row.priceAmount} {row.currencyCode}</td><td>{row.category ? (ar ? row.category.nameAr ?? row.category.nameEn : row.category.nameEn) : '—'}</td><td>{row.seller.displayName ?? row.seller.id}</td><td>{row.seller.status ?? '—'}</td><td>{[row.city, row.countryCode].filter(Boolean).join(', ')}</td>
          </tr>)}</tbody></table></div>
        </section>
      )}
    </main>
  );
}
