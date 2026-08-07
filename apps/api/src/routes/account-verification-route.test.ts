import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('./account-verification.ts', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const migrationSource = readFileSync(
  new URL('../../../../infra/db/migrations/012_account_contact_verification.sql', import.meta.url),
  'utf8'
);

assert.match(routeSource, /app\.get\('\/account\/verification', \{ preHandler: requireUser \}/);
assert.match(routeSource, /app\.post\('\/account\/verification\/request', \{ preHandler: requireUser \}/);
assert.match(routeSource, /app\.post\('\/account\/verification\/confirm', \{ preHandler: requireUser \}/);
assert.match(routeSource, /VERIFICATION_CODE_PEPPER/);
assert.match(routeSource, /VERIFICATION_DELIVERY_PROVIDER/);
assert.doesNotMatch(routeSource, /send\(\{[^}]*code:/s);
assert.match(serverSource, /app\.register\(accountVerificationRoutes, \{ prefix: '\/v1' \}\)/);
assert.match(migrationSource, /code_hash char\(64\) NOT NULL/);
assert.match(migrationSource, /contact_fingerprint char\(64\) NOT NULL/);
assert.match(migrationSource, /max_attempts smallint NOT NULL DEFAULT 5/);
assert.match(migrationSource, /consumed_at timestamptz/);
assert.match(migrationSource, /invalidated_at timestamptz/);

console.log('Account verification route surface tests passed.');
