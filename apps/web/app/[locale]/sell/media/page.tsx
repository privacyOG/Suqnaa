import { notFound } from 'next/navigation';
import { ListingMediaManagerPanel } from '../../../../components/listing-media-manager-panel';
import { SessionRefresh } from '../../../../components/session-refresh';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';

export default async function ManageListingMediaPage({
  params
}: {
  params: { locale: string };
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
          <a href={`/${params.locale}/sell`}>{isArabic ? 'إعلان جديد' : 'New listing'}</a>
          <a href={`/${params.locale}/sell/manage`}>{isArabic ? 'إعلاناتي' : 'My listings'}</a>
          <a href={`/${params.locale}/messages`}>{isArabic ? 'الرسائل' : 'Messages'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <header className="seller-page-header">
        <div>
          <div className="eyebrow">{isArabic ? 'صور الإعلان' : 'Listing photos'}</div>
          <h1>{isArabic ? 'إدارة معرض الصور' : 'Manage your photo galleries'}</h1>
          <p>
            {isArabic
              ? 'اعرض صور المسودات والإعلانات المنشورة، وأضف أو احذف صورة واحدة في كل عملية تحقق.'
              : 'Preview draft and published photos, then add or remove one image per verified operation.'}
          </p>
        </div>
        {user ? (
          <div className="seller-identity-card">
            <span>{isArabic ? 'البائع' : 'Seller'}</span>
            <strong>{user.display_name}</strong>
            <small>{isArabic ? `حالة الحساب: ${user.status}` : `Account status: ${user.status}`}</small>
          </div>
        ) : null}
      </header>

      {user ? (
        <ListingMediaManagerPanel locale={params.locale} />
      ) : needsRotation ? (
        <div className="seller-session-panel">
          <SessionRefresh locale={params.locale} />
        </div>
      ) : (
        <div className="signed-out-panel seller-session-panel">
          <p className="auth-error">
            {isArabic
              ? 'سجّل الدخول لإدارة صور إعلاناتك.'
              : 'Sign in to manage your listing photos.'}
          </p>
          <a className="button-primary" href={`/${params.locale}/account/sign-in`}>
            {isArabic ? 'تسجيل الدخول' : 'Sign in'}
          </a>
        </div>
      )}
    </main>
  );
}
