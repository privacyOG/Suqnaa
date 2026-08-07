import { notFound } from 'next/navigation';
import { ListingLifecyclePanel } from '../../../../../../components/listing-lifecycle-panel';
import { SessionRefresh } from '../../../../../../components/session-refresh';
import { isLocale } from '../../../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../../../lib/account-session-state';

export default async function ListingLifecyclePage({
  params
}: {
  params: { locale: string; listingId: string };
}) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  return (
    <main className="page-shell seller-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/sell/manage`}>{isArabic ? 'إعلاناتي' : 'My listings'}</a>
          <a href={`/${params.locale}/sell/manage/${params.listingId}/edit`}>
            {isArabic ? 'تعديل التفاصيل' : 'Edit details'}
          </a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="seller-page-header">
        <div>
          <div className="eyebrow">{isArabic ? 'إدارة الإعلان' : 'Listing management'}</div>
          <h1>{isArabic ? 'الانتهاء والتجديد والمخزون' : 'Expiry, renewal and inventory'}</h1>
          <p>
            {isArabic
              ? 'راجع تاريخ انتهاء الإعلان والمخزون المتاح وجدده أو أعد تنشيطه عندما يصبح مؤهلاً.'
              : 'Review listing expiry and available inventory, then renew or reactivate it when eligible.'}
          </p>
        </div>
      </header>

      {user ? (
        <ListingLifecyclePanel locale={params.locale} listingId={params.listingId} />
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic ? 'سجّل الدخول لإدارة دورة حياة الإعلان.' : 'Sign in to manage this listing lifecycle.'}
          </p>
          <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
            {isArabic ? 'تسجيل الدخول' : 'Sign in'}
          </a>
        </div>
      )}
    </main>
  );
}
