import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeSource = await readFile(new URL('./listing-lifecycle.ts', import.meta.url), 'utf8');
const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(routeSource, /\/listings\/:listingId\/renew/);
assert.match(routeSource, /preHandler: requireUser/);
assert.match(routeSource, /version: z\.number\(\)\.int\(\)\.positive\(\)/);
assert.match(routeSource, /renewOrReactivateListing/);
assert.match(routeSource, /listing\.renew/);
assert.doesNotMatch(routeSource, /sellerId.*request\.body/);
assert.match(serverSource, /listingLifecycleRoutes/);
assert.match(serverSource, /app\.register\(listingLifecycleRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Listing lifecycle route surface tests passed.');
