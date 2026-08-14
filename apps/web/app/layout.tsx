import type { Metadata } from 'next';
import { siteUrl } from '../lib/seo';
import './globals.css';
import './auth-components.css';
import './marketplace-components.css';
import './conversation-components.css';
import './catalog-components.css';
import './catalog-search.css';
import './activity-components.css';
import './activity-detail-components.css';
import './policy-components.css';
import './accessibility.css';

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: 'Suqnaa | Trusted marketplace',
  description: 'Buy, sell, and connect through a trusted marketplace built around fairness and quality.',
  applicationName: 'Suqnaa',
  openGraph: {
    type: 'website',
    siteName: 'Suqnaa',
    title: 'Suqnaa | Trusted marketplace',
    description: 'Buy, sell, and connect through a trusted marketplace built around fairness and quality.'
  },
  twitter: {
    card: 'summary',
    title: 'Suqnaa | Trusted marketplace',
    description: 'Buy, sell, and connect through a trusted marketplace built around fairness and quality.'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
