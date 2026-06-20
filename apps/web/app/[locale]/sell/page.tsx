export default function SellPage({ params }: { params: { locale: string } }) {
  const isArabic = params.locale === 'ar';

  return (
    <main className="page-shell auth-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <a className="language-link" href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
      </nav>

      <section className="auth-card">
        <div className="eyebrow">{isArabic ? 'بيع' : 'Sell'}</div>
        <h1>{isArabic ? 'أنشئ إعلانك الأول' : 'Create your first listing'}</h1>
        <p>
          {isArabic
            ? 'واجهة أولية لإضافة عنوان ووصف وسعر وموقع الإعلان. سيتم ربطها بطبقة الحسابات المحمية.'
            : 'Initial interface for adding a title, description, price, and location. This will connect to the protected account flow.'}
        </p>
        <div className="form-grid">
          <label>{isArabic ? 'العنوان' : 'Title'}<input placeholder={isArabic ? 'مثال: هاتف جديد' : 'Example: New phone'} /></label>
          <label>{isArabic ? 'الوصف' : 'Description'}<textarea rows={5} placeholder={isArabic ? 'اكتب تفاصيل الإعلان' : 'Write listing details'} /></label>
          <label>{isArabic ? 'السعر' : 'Price'}<input type="number" min="0" placeholder="0.00" /></label>
          <label>{isArabic ? 'العملة' : 'Currency'}<input placeholder="AUD" maxLength={3} /></label>
          <button className="button-primary" type="button">{isArabic ? 'حفظ كمسودة' : 'Save as draft'}</button>
        </div>
      </section>
    </main>
  );
}
