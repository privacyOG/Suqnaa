import { notFound, redirect } from 'next/navigation';
import { DiscoveryCentre } from '../../../../components/discovery-centre';
import { SessionRefresh } from '../../../../components/session-refresh';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';

export default async function DiscoveryPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  if (!user && !needsRotation) {
    redirect(`/${params.locale}/account/sign-in`);
  }

  return (
    <main className="page-shell">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/listings`}>{isArabic ? 'السوق' : 'Marketplace'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
          <a className="language-link" href={`/${isArabic ? 'en' : 'ar'}/account/discovery`}>
            {isArabic ? 'English' : 'العربية'}
          </a>
        </div>
      </nav>
      {user ? <DiscoveryCentre locale={params.locale} /> : <SessionRefresh locale={params.locale} />}
    </main>
  );
}
