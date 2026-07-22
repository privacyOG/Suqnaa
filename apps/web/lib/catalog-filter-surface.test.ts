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

assert.match(page, /getPublicCategories/);
assert.match(page, /name="categoryId"/);
assert.match(page, /name="sort"/);
assert.match(page, /value="price_asc"/);
assert.match(page, /value="price_desc"/);
assert.match(page, /name="region"/);
assert.match(page, /name="city"/);
assert.match(page, /name="suburb"/);
assert.match(page, /value="both"/);
assert.match(page, /options\.sort !== 'newest'/);
assert.match(page, /catalogHref\(params\.locale, options, nextCursor\)/);
assert.match(page, /listing\.category/);
assert.match(page, /Pickup and delivery/);

assert.match(transport, /PublicListingSort = 'newest' \| 'price_asc' \| 'price_desc'/);
assert.match(transport, /PublicListingFulfilment = 'pickup' \| 'delivery' \| 'both'/);
assert.match(transport, /query\.set\('region'/);
assert.match(transport, /query\.set\('suburb'/);
assert.match(transport, /query\.set\('sort'/);
assert.match(transport, /category: PublicCategorySummary \| null/);
assert.doesNotMatch(transport, /authorization/i);

assert.match(categories, /process\.env\.API_BASE_URL/);
assert.match(categories, /sortOrder - right\.sortOrder/);
