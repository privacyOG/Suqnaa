import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const requiredFiles = [
  'apps/web/lib/seo.ts',
  'apps/web/app/robots.ts',
  'apps/web/app/sitemap.ts',
  'apps/web/app/[locale]/listings/layout.tsx',
  'apps/web/app/[locale]/listings/[listingId]/layout.tsx',
  'docs/WEB_SEO.md'
];
for (const path of requiredFiles) {
  assert.ok(existsSync(new URL(path, root)), `Missing P1-12 SEO file: ${path}`);
}

const seo = read('apps/web/lib/seo.ts');
const robots = read('apps/web/app/robots.ts');
const sitemap = read('apps/web/app/sitemap.ts');
const rootLayout = read('apps/web/app/layout.tsx');
const localeLayout = read('apps/web/app/[locale]/layout.tsx');
const marketplaceLayout = read('apps/web/app/[locale]/listings/layout.tsx');
const listingLayout = read('apps/web/app/[locale]/listings/[listingId]/layout.tsx');

assert.match(seo, /NEXT_PUBLIC_SITE_URL/);
assert.match(seo, /x-default/);
assert.match(seo, /openGraph/);
assert.match(seo, /twitter/);
assert.match(seo, /'@type': 'Product'/);
assert.match(seo, /'@type': 'Offer'/);
assert.match(seo, /listing\.city, listing\.region, listing\.countryCode/);
assert.doesNotMatch(seo, /areaServed:[\s\S]{0,120}listing\.suburb/);
assert.doesNotMatch(seo, /seller\.emailVerified|seller\.phoneVerified|trustScore/);

assert.match(rootLayout, /metadataBase: siteUrl/);
assert.match(localeLayout, /localeCanonical\(locale, '\/'\)/);
assert.match(marketplaceLayout, /localeCanonical\(locale, '\/listings'\)/);
assert.match(listingLayout, /listingMetadata/);
assert.match(listingLayout, /listingProductJsonLd/);
assert.match(listingLayout, /robots: \{ index: false, follow: false \}/);
assert.match(listingLayout, /replace\(\/<\/g, '\\\\u003c'\)/);

for (const privatePath of ['/api/', '/en/account/', '/ar/account/', '/en/messages/', '/ar/messages/', '/en/activity/', '/ar/activity/', '/en/notifications/', '/ar/notifications/', '/en/sell/', '/ar/sell/']) {
  assert.ok(robots.includes(`'${privatePath}'`), `robots.ts must disallow ${privatePath}`);
}
assert.match(robots, /sitemap: absoluteUrl\('\/sitemap\.xml'\)/);

assert.match(sitemap, /getPublicListings/);
assert.match(sitemap, /maxListingPages = 10/);
assert.match(sitemap, /\/listings\/\$\{listing\.id\}/);
assert.match(sitemap, /catch \{/);
assert.doesNotMatch(sitemap, /nearLat|nearLon|suburb|account|messages|orders/);

console.log('P1-12 web SEO contract passed: canonicals, robots, sitemap, social previews, and privacy-safe product data are present.');
