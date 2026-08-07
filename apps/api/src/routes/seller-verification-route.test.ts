import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./seller-verification.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(source, /get\('\/account\/seller-verification', \{ preHandler: requireUser \}/);
assert.match(source, /post\('\/account\/seller-verification\/start', \{ preHandler: requireUser \}/);
assert.match(source, /post\('\/seller-verification\/provider-events'/);
assert.match(source, /account\.seller_verification_start/);
assert.match(source, /verifySellerVerificationEventSignature/);
assert.match(source, /applySellerVerificationProviderEvent/);
assert.doesNotMatch(source, /reviewSellerVerification/);
assert.match(server, /register\(sellerVerificationRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Seller verification route surface tests passed.');
