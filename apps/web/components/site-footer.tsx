import Link from 'next/link';
import type { Locale } from '../i18n/locales';
import { getMessages } from '../i18n/get-messages';

export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const policyBase = `/${locale}/policy`;
  const ar = locale === 'ar';

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <Link className="footer-brand" href={`/${locale}`}>
            Suqnaa <span>سوقنا</span>
          </Link>
          <p>{messages.footer.tagline}</p>
          <small>{messages.footer.status}</small>
        </div>
        <nav className="footer-links" aria-label={ar ? 'السياسات والمساعدة' : 'Policies and help'}>
          <Link href={`/${locale}/legal`}>{ar ? 'مركز السياسات' : 'Policy centre'}</Link>
          <Link href={`${policyBase}/terms`}>{messages.footer.terms}</Link>
          <Link href={`${policyBase}/privacy`}>{messages.footer.privacy}</Link>
          <Link href={`${policyBase}/item-rules`}>{messages.footer.prohibitedItems}</Link>
          <Link href={`${policyBase}/safety`}>{messages.footer.safety}</Link>
          <Link href={`${policyBase}/payments`}>{ar ? 'المدفوعات' : 'Payments'}</Link>
          <Link href={`${policyBase}/refunds`}>{ar ? 'الاسترداد' : 'Refunds'}</Link>
          <Link href={`${policyBase}/disputes`}>{ar ? 'النزاعات' : 'Disputes'}</Link>
          <Link href={`${policyBase}/returns`}>{ar ? 'الإرجاع' : 'Returns'}</Link>
          <Link href={`${policyBase}/acceptable-use`}>{ar ? 'الاستخدام المقبول' : 'Acceptable use'}</Link>
          <Link href={`${policyBase}/data-retention`}>{ar ? 'الاحتفاظ بالبيانات' : 'Data retention'}</Link>
          <Link href={`${policyBase}/contact`}>{messages.footer.contact}</Link>
        </nav>
      </div>
    </footer>
  );
}
