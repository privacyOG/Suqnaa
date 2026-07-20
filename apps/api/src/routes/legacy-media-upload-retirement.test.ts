import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const listingsSource = readFileSync(
  new URL('./listings.ts', import.meta.url),
  'utf8'
);

assert.doesNotMatch(listingsSource, /base64Data/);
assert.doesNotMatch(
  listingsSource,
  /app\.post\('\/listings\/:listingId\/media',/
);
assert.match(
  listingsSource,
  /app\.get\('\/listings',/
);
