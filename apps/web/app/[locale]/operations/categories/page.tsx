import { isLocale } from '../../../../i18n/locales';
import { loadOperationsCategories } from '../../../../lib/operations-review-server';

export default async function OperationsCategoriesPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const ar = params.locale === 'ar';
  const data = await loadOperationsCategories();

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/operations`}>{ar ? 'لوحة الإدارة' : 'Administration'}</a>
          <a href={`/${params.locale}/account`}>{ar ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>
      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{ar ? 'إدارة محمية' : 'Protected administration'}</span>
          <h1>{ar ? 'الفئات' : 'Categories'}</h1>
          <p>{ar ? 'جرد إداري للفئات النشطة وغير النشطة. تغييرات سياسة الفئات وتطبيق العناصر المحظورة تظل ضمن P0-29.' : 'Administrative inventory of active and inactive categories. Category-policy mutation and prohibited-item enforcement remain P0-29.'}</p>
        </div>
      </section>
      {!data ? <p>{ar ? 'غير متاح أو لا توجد صلاحية.' : 'Unavailable or not authorised.'}</p> : (
        <section className="seller-session-panel">
          <h2>{ar ? 'جرد الفئات' : 'Category inventory'}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>{ar ? 'الاسم' : 'Name'}</th><th>Slug</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'الترتيب' : 'Order'}</th><th>{ar ? 'الفئة الأم' : 'Parent'}</th></tr></thead>
              <tbody>{data.categories.map((row) => <tr key={row.id}>
                <td>{ar ? row.nameAr : row.nameEn}</td><td>{row.slug}</td><td>{row.active ? (ar ? 'نشطة' : 'Active') : (ar ? 'غير نشطة' : 'Inactive')}</td><td>{row.sortOrder}</td><td>{row.parentId ?? '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
