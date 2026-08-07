import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('./discovery.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

for (const path of [
  '/discovery/listings/:listingId/state',
  '/discovery/saved-listings',
  '/discovery/saved-listings/:listingId/save',
  '/discovery/saved-listings/:listingId/remove',
  '/discovery/watchlist',
  '/discovery/watchlist/:listingId/watch',
  '/discovery/watchlist/:listingId/remove',
  '/discovery/recently-viewed',
  '/discovery/recently-viewed/:listingId/view',
  '/discovery/saved-searches',
  '/discovery/saved-searches/:searchId/update',
  '/discovery/saved-searches/:searchId/delete',
  '/discovery/notifications',
  '/discovery/notifications/:notificationId/read',
  '/discovery/notifications/read-all'
]) {
  assert.match(route, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\:([A-Za-z]+)/g, ':$1')));
}

assert.match(route, /preHandler: requireUser/g);
assert.match(route, /savedSearchBody = z\.object\(/);
assert.match(route, /savedSearchUpdateBody = z\.object\(/);
assert.match(route, /\.strict\(\)/g);
assert.match(route, /authRequest\.user\.sub/);
assert.doesNotMatch(route, /userId:\s*z\./);
assert.doesNotMatch(route, /sellerId:\s*z\./);
assert.doesNotMatch(route, /buyerId:\s*z\./);
assert.match(route, /discovery\.mutation\.account/);
assert.match(route, /discovery\.read\.account/);
assert.match(server, /import \{ discoveryRoutes \} from '\.\/routes\/discovery\.js'/);
assert.match(server, /app\.register\(discoveryRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Discovery route surface tests passed.');
