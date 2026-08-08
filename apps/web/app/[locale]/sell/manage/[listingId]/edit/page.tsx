import { notFound } from 'next/navigation';
import { EditListingForm } from '../../../../../../components/edit-listing-form';
import { ListingLocationForm } from '../../../../../../components/listing-location-form';
import { SessionRefresh } from '../../../../../../components/session-refresh';
import { isLocale } from '../../../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../../../lib/account-session-state';

export default async function EditListingPage({
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
          <a href={`/${params.locale}/sell/manage/${params.listingId}/lifecycle`}>
            {isArabic ? 'الانتهاء والتجديد' : 'Expiry and renewal'}
          </a>
          <a href={`/${params.locale}/sell/media`}>{isArabic ? 'إدارة الصور' : 'Manage photos'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="seller-page-header">
        <div>
          <div className="eyebrow">{isArabic ? 'إدارة الإعلان' : 'Listing management'}</div>
          <h1>{isArabic ? 'تعديل تفاصيل الإعلان' : 'Edit listing details'}</h1>
          <p>
            {isArabic
              ? 'يتم الحفظ باستخدام رقم نسخة يمنع الكتابة فوق تغييرات أحدث من جهاز أو جلسة أخرى.'
              : 'Saves use a version check so an older form cannot overwrite newer changes from another device or session.'}
          </p>
        </div>
      </header>

      {user ? (
        <>
          <EditListingForm locale={params.locale} listingId={params.listingId} />
          <ListingLocationForm locale={params.locale} listingId={params.listingId} />
        </>
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic ? 'سجّل الدخول لتعديل الإعلان.' : 'Sign in to edit this listing.'}
          </p>
          <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
            {isArabic ? 'تسجيل الدخول' : 'Sign in'}
          </a>
        </div>
      )}
    </main>
  );
}
