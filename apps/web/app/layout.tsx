import type { Metadata } from 'next';
import './globals.css';
import './auth-components.css';
import './marketplace-components.css';
import './conversation-components.css';

export const metadata: Metadata = {
  title: 'Suqnaa | Trusted marketplace',
  description: 'Buy, sell, and connect through a trusted marketplace built around fairness and quality.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
