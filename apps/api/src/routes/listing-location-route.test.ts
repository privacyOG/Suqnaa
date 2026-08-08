import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('./listing-location.ts', import.meta.url), 'utf8');
const service = readFileSync(
  new URL('../listings/listing-location-service.ts', import.meta.url),
  'utf8'
);

assert.match(route, /app\.get\('\/listings\/:listingId\/location\/manage'/);
assert.match(route, /app\.post\('\/listings\/:listingId\/location'/);
assert.match(route, /preHandler: requireUser/g);
assert.match(route, /version: z\.number\(\)\.int\(\)\.min\(1\)/);
assert.match(route, /approximateLocation: approximateListingLocationInput\.nullable\(\)/);
assert.match(route, /action: 'listing\.edit'/);
assert.match(route, /locationConfigured:/);
assert.doesNotMatch(route, /latitude: body/);
assert.doesNotMatch(route, /longitude: body/);
assert.match(service, /where\('edit_version', '=', input\.version\)/);
assert.match(service, /editableListingStatuses/);
assert.match(service, /location: requested \? listingLocationGeography\(requested\) : null/);
assert.match(service, /unchanged: true/);
assert.match(service, /ST_Y\(location::geometry\)/);
assert.match(service, /ST_X\(location::geometry\)/);

console.log('Protected listing location route surface tests passed.');
