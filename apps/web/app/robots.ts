import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/en/account/', '/ar/account/', '/en/messages/', '/ar/messages/', '/en/activity/', '/ar/activity/', '/en/notifications/', '/ar/notifications/', '/en/sell/', '/ar/sell/']
    },
    sitemap: absoluteUrl('/sitemap.xml')
  };
}
