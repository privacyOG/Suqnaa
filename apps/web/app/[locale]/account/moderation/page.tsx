import { notFound } from 'next/navigation';
import { ModerationAppealsPanel } from '../../../../components/moderation-appeals-panel';
import { isLocale } from '../../../../i18n/locales';
import { loadParticipantModerationActions } from '../../../../lib/moderation-participant-server';

export default async function AccountModerationPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const isArabic = params.locale === 'ar';
  const actions = await loadParticipantModerationActions();

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
          <a href={`/${isArabic ? 'en' : 'ar'}/account/moderation`}>{isArabic ? 'English' : 'العربية'}</a>
        </div>
      </nav>

      <section className="catalog-header">
        <div>
          <span className="buyer-action-label">{isArabic ? 'حقوق المراجعة' : 'Review rights'}</span>
          <h1>{isArabic ? 'إجراءات الإشراف والاستئناف' : 'Moderation actions and appeals'}</h1>
          <p>
            {isArabic
              ? 'راجع إجراءات الإشراف المرتبطة بحسابك وقدّم استئنافاً خلال المهلة المتاحة.'
              : 'Review moderation actions associated with your account and submit an appeal within the available window.'}
          </p>
        </div>
      </section>

      {actions === null ? (
        <section className="seller-session-panel">
          <h2>{isArabic ? 'يلزم تسجيل الدخول' : 'Sign-in required'}</h2>
          <p>{isArabic ? 'سجّل الدخول لعرض إجراءات الإشراف الخاصة بحسابك.' : 'Sign in to view moderation actions associated with your account.'}</p>
          <a className="button-primary" href={`/${params.locale}/account/sign-in`}>{isArabic ? 'تسجيل الدخول' : 'Sign in'}</a>
        </section>
      ) : (
        <ModerationAppealsPanel locale={params.locale} actions={actions} />
      )}
    </main>
  );
}
