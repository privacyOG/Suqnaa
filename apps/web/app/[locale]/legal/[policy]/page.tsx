import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '../../../../i18n/locales';
import { isLegalPolicySlug, legalPolicyFor } from '../../../../lib/legal-policy-content';

export default function LegalPolicyDetailPage({ params }: { params: { locale: string; policy: string } }) {
  if (!isLocale(params.locale) || !isLegalPolicySlug(params.policy)) notFound();
  const locale = params.locale as Locale;
  const ar = locale === 'ar';
  const policy = legalPolicyFor(params.policy, locale);

  return (
    <main className="page-shell catalog-page" dir={ar ? 'rtl' : 'ltr'}>
      <nav className="top-nav">
        <a className="brand-word" href={`/${locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${locale}/legal`}>{ar ? 'كل السياسات' : 'All policies'}</a>
          <a href={`/${locale}/account`}>{ar ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{ar ? 'مرشح للمراجعة القانونية' : 'Legal-review candidate'}</span>
          <h1>{policy.content.title}</h1>
          <p>{policy.content.summary}</p>
          <p><small>
            {ar ? 'الإصدار' : 'Version'}: {policy.version} · {ar ? 'آخر تحديث' : 'Last updated'}: {policy.lastUpdated} ·{' '}
            {ar ? 'تاريخ النفاذ' : 'Effective date'}: {policy.effectiveDate ?? (ar ? 'غير نافذ بعد' : 'not yet effective')}
          </small></p>
        </div>
      </section>

      <section className="seller-session-panel" role="note" aria-label={ar ? 'حالة المراجعة' : 'Review status'}>
        <strong>{ar ? 'حالة المراجعة: بانتظار الاعتماد القانوني' : 'Review status: pending legal approval'}</strong>
        <p>{ar
          ? 'لا ينبغي التعامل مع هذه الصياغة باعتبارها شروطاً قانونية نافذة. يجب استبدالها أو اعتمادها رسمياً بعد مراجعة قانونية أسترالية قبل الإطلاق العام.'
          : 'This candidate must not be treated as operative legal terms. It must be formally approved or replaced after Australian legal review before public launch.'}</p>
      </section>

      <article style={{ display: 'grid', gap: 24 }}>
        {policy.content.sections.map((section) => (
          <section className="seller-session-panel" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </article>
    </main>
  );
}
