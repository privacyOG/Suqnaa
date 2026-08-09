import { isLocale } from '../../../../i18n/locales';
import { OperationsModerationPanel } from '../../../../components/operations-moderation-panel';

export default function OperationsModerationPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return null;
  const ar = params.locale === 'ar';

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/operations`}>{ar ? 'لوحة الإدارة' : 'Administration'}</a>
        </div>
      </nav>
      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{ar ? 'سياسة وإجراءات الإشراف' : 'Moderation policy & enforcement'}</span>
          <h1>{ar ? 'مركز الإشراف' : 'Moderation centre'}</h1>
          <p>{ar
            ? 'إدارة قواعد العناصر المحظورة، إجراءات الإعلانات والحسابات، الاستئنافات، الملاحظات، وفترات الاحتفاظ بالأدلة ضمن صلاحيات إدارية محددة.'
            : 'Manage prohibited-item rules, listing/account actions, appeals, moderator records, and evidence-retention controls under granular administrative permissions.'}</p>
        </div>
      </section>
      <OperationsModerationPanel locale={params.locale} />
    </main>
  );
}
