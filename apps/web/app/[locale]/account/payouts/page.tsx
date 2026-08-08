import { notFound } from 'next/navigation';
import { SellerPayoutPanel } from '../../../../components/seller-payout-panel';
import { isLocale } from '../../../../i18n/locales';

export default function SellerPayoutPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as 'en' | 'ar';
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <a className="brand-word" href={`/${locale}`}>Suqnaa</a>
        <a className="language-link" href={`/${locale}/account`}>Account</a>
      </nav>
      <section className="hero account-hero">
        <div>
          <div className="eyebrow">Seller</div>
          <h1>Settlements and payouts</h1>
          <p>Complete payout onboarding and review settlement and transfer status.</p>
        </div>
      </section>
      <SellerPayoutPanel locale={locale} />
    </main>
  );
}
