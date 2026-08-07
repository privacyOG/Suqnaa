import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./operations-verifications.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(source, /get\('\/operations\/verifications', \{ preHandler: requireOperationsUser \}/);
assert.match(source, /post\('\/operations\/verifications\/:id\/review', \{ preHandler: requireOperationsUser \}/);
assert.match(source, /reviewSellerVerification/);
assert.doesNotMatch(source, /preHandler: requireUser/);
assert.match(server, /register\(operationsVerificationRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Verification operations route surface tests passed.');
