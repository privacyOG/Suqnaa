# Marketplace SEO and discovery

P1-12 defines the public search-engine and social-preview boundary for the Suqnaa web marketplace.

## Canonical site origin

The web app resolves its canonical origin from `NEXT_PUBLIC_SITE_URL`, falling back to the existing `WEB_ORIGIN` deployment setting. Production must provide one exact HTTPS origin without credentials, query parameters, or fragments. Local development falls back to `http://localhost:3000`.

Do not point canonical metadata at staging, preview, or branch-deployment hosts when producing a public release.

## Localised canonical URLs

English and Arabic public pages publish locale-specific canonical URLs and language alternatives:

- `/en/...` for English
- `/ar/...` for Arabic
- `x-default` resolves to the English equivalent

The marketplace root and public listing detail routes are indexable. Account, messaging, activity, notification, seller-management, and API surfaces are excluded through the robots policy because they are authenticated, private, operational, or non-discovery routes.

## Sitemap

`/sitemap.xml` always contains the public English and Arabic marketplace roots and legal pages. It also attempts to enumerate active public listings from the provider-neutral public listing API in bounded pages. If the API is temporarily unavailable, sitemap generation degrades to the static public URLs rather than failing the route.

Only public listing identifiers are emitted. No account identifiers, private addresses, message/order identifiers, search terms, session state, or precise location coordinates are written to the sitemap.

## Listing social previews

Public listing pages derive title, description, canonical URL, Open Graph metadata, Twitter card metadata, and up to four public listing images from the same public listing payload shown on the page. A missing or unavailable listing is marked `noindex, nofollow` at the metadata layer.

## Product structured data

Active listing pages emit JSON-LD `Product` + `Offer` data using only information already public on the listing:

- title and bounded description
- public listing images
- category
- condition and availability
- public price and currency
- public seller display/business name
- coarse service area using city, region, and country only

Structured data deliberately excludes suburb-level precision, coordinates, email/phone details, seller account IDs, trust/security state, private fulfilment addresses, payment references, and any authenticated marketplace data.

## Validation

Run:

```bash
node scripts/validate-web-seo.mjs
```

The dedicated Web SEO workflow runs the same contract on pull requests that change the SEO implementation, discovery metadata, or validation script. The normal Quality Gate still owns TypeScript checking, tests, and the production Next.js build.
