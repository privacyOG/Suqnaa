import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const routeSource = readFileSync(
  new URL('../routes/payments.ts', import.meta.url),
  'utf8'
);

assert.match(routeSource, /orderId:\s*z\.string\(\)\.uuid\(\)/);
assert.match(routeSource, /\.strict\(\)/);
assert.match(routeSource, /preHandler:\s*requireUser/);
assert.doesNotMatch(routeSource, /buyerId:\s*z\./);
assert.doesNotMatch(routeSource, /sellerId:\s*z\./);
assert.doesNotMatch(routeSource, /amount:\s*z\./);
assert.doesNotMatch(routeSource, /currencyCode:\s*z\./);
assert.doesNotMatch(routeSource, /rail:\s*z\./);
assert.equal(
  existsSync(new URL('../routes/checkout.ts', import.meta.url)),
  false
);
