import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('./listing-edit.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../listings/listing-edit-service.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(route, /get\('\/listings\/:listingId\/manage', \{ preHandler: requireUser \}/);
assert.match(route, /post\('\/listings\/:listingId\/edit', \{ preHandler: requireUser \}/);
assert.match(route, /version: z\.number\(\)\.int\(\)\.min\(1\)/);
assert.match(route, /action: 'listing\.edit'/);
assert.match(route, /currentVersion/);
assert.match(route, /currentStatus/);
assert.match(route, /authRequest\.user\.sub/);
assert.doesNotMatch(route, /userId: z\./);
assert.match(service, /where\('seller_id', '=', input\.userId\)/);
assert.match(service, /where\('edit_version', '=', edit\.version\)/);
assert.match(service, /editableListingStatuses = new Set\(\['draft', 'active', 'expired'\]\)/);
assert.match(service, /'listing_conflict'/);
assert.match(service, /'listing_not_editable'/);
assert.match(server, /register\(listingEditRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Seller listing edit route surface tests passed.');
