import Link from 'next/link';
import type { Locale } from '../i18n/locales';
import { getMessages } from '../i18n/get-messages';

export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const policyBase = `/${locale}/policy`;

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
        <nav className="footer-links">
          <Link href={`${policyBase}/terms`}>{messages.footer.terms}</Link>
          <Link href={`${policyBase}/privacy`}>{messages.footer.privacy}</Link>
          <Link href={`${policyBase}/items`}>{messages.footer.prohibitedItems}</Link>
          <Link href={`${policyBase}/safety`}>{messages.footer.safety}</Link>
          <Link href={`${policyBase}/contact`}>{messages.footer.contact}</Link>
        </nav>
      </div>
    </footer>
  );
}
