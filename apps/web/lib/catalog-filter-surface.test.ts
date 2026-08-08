import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(
  new URL('../app/[locale]/listings/page.tsx', import.meta.url),
  'utf8'
);
const transport = readFileSync(
  new URL('./public-listing-api.ts', import.meta.url),
  'utf8'
);
const categories = readFileSync(
  new URL('./category-api.ts', import.meta.url),
  'utf8'
);
const discovery = readFileSync(
  new URL('./discovery-api.ts', import.meta.url),
  'utf8'
);

assert.match(page, /getPublicCategories/);
assert.match(page, /name="categoryId"/);
assert.match(page, /name="sort"/);
assert.match(page, /value="price_asc"/);
assert.match(page, /value="price_desc"/);
assert.match(page, /value="distance"/);
assert.match(page, /name="region"/);
assert.match(page, /name="city"/);
assert.match(page, /name="suburb"/);
assert.match(page, /name="nearLat"/);
assert.match(page, /name="nearLon"/);
assert.match(page, /name="radiusKm"/);
assert.match(page, /step="0\.01"/);
assert.match(page, /max="500"/);
assert.match(page, /privacyGrid/);
assert.match(page, /Seller coordinates are never published/);
assert.match(page, /distanceLabel\(listing\.distanceKm/);
assert.match(page, /nearLat: options\.nearLat/);
assert.match(page, /radiusKm: options\.radiusKm/);
assert.match(page, /value="both"/);
assert.match(page, /options\.sort !== 'newest'/);
assert.match(page, /catalogHref\(params\.locale, options, nextCursor\)/);
assert.match(page, /listing\.category/);
assert.match(page, /Pickup and delivery/);

assert.match(transport, /PublicListingSort = 'newest' \| 'price_asc' \| 'price_desc' \| 'distance'/);
assert.match(transport, /PublicListingFulfilment = 'pickup' \| 'delivery' \| 'both'/);
assert.match(transport, /nearLat\?: number/);
assert.match(transport, /nearLon\?: number/);
assert.match(transport, /radiusKm\?: number/);
assert.match(transport, /distanceKm: number \| null/);
assert.match(transport, /options\.nearLat\.toFixed\(2\)/);
assert.match(transport, /query\.set\('region'/);
assert.match(transport, /query\.set\('suburb'/);
assert.match(transport, /query\.set\('sort'/);
assert.match(transport, /category: PublicCategorySummary \| null/);
assert.doesNotMatch(transport, /authorization/i);
assert.doesNotMatch(transport, /approximateLocation/);

assert.match(discovery, /\| 'nearLat'/);
assert.match(discovery, /\| 'nearLon'/);
assert.match(discovery, /\| 'radiusKm'/);

assert.match(categories, /process\.env\.API_BASE_URL/);
assert.match(categories, /sortOrder - right\.sortOrder/);

console.log('Web catalogue filter surface tests passed.');
