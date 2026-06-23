import { notFound, redirect } from 'next/navigation';
import { StripeCheckoutPanel } from '../../../../components/stripe-checkout';
import { SessionRefresh } from '../../../../components/session-refresh';
import { isLocale } from '../../../../i18n/locales';
import { loadAccountSessionState } from '../../../../lib/account-session-state';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CheckoutPage({
  params
}: {
  params: { locale: string; orderId: string };
}) {
  if (!isLocale(params.locale) || !uuidPattern.test(params.orderId)) {
    notFound();
  }

  const isArabic = params.locale === 'ar';
  const { user, needsRotation } = await loadAccountSessionState();

  if (!user && !needsRotation) {
    redirect(`/${params.locale}/account/sign-in`);
  }

  return (
    <main className="page-shell catalog-page">
      <nav className="top-nav">
        <a className="brand-word" href={`/${params.locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${params.locale}/activity/orders`}>{isArabic ? 'الطلبات' : 'Orders'}</a>
          <a href={`/${params.locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
        </div>
      </nav>

      <div className="listing-breadcrumbs">
        <a href={`/${params.locale}/activity/orders`}>{isArabic ? 'الطلبات' : 'Orders'}</a>
        <span>›</span>
        <a href={`/${params.locale}/activity/orders/${params.orderId}`}>
          {isArabic ? 'تفاصيل الطلب' : 'Order details'}
        </a>
        <span>›</span>
        <span>{isArabic ? 'الدفع' : 'Payment'}</span>
      </div>

      <section className="listing-buyer-section">
        {needsRotation ? (
          <div className="buyer-session-panel">
            <SessionRefresh locale={params.locale} />
          </div>
        ) : (
          <StripeCheckoutPanel
            locale={params.locale}
            orderId={params.orderId}
          />
        )}
      </section>
    </main>
  );
}
