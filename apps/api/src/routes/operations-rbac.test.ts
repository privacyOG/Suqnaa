import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./operations.ts', import.meta.url), 'utf8');

assert.match(source, /result: z\.enum\(\['no_change', 'other'\]\)/);
assert.match(source, /review_action: 'changed_listing'/);
assert.match(source, /review_action: 'changed_account'/);
assert.match(source, /targetAdministrativeAssignment/);
assert.match(source, /administrativePermissions\.has\('roles\.manage'\)/);
assert.match(source, /Role management permission required for administrative accounts/);

const genericCompletion = source.slice(
  source.indexOf("app.post('/operations/queue/:id/complete'"),
  source.indexOf("app.post('/operations/queue/:id/listing-status'")
);
assert.doesNotMatch(genericCompletion, /changed_listing|changed_account/);

console.log('Operations least-privilege route tests passed.');
