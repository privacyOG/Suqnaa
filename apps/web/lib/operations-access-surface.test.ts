import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProtectedRoute } from './protected-route-policy';

const userId = '123e4567-e89b-42d3-a456-426614174000';
for (const segments of [
  ['v1', 'operations', 'access', 'me'],
  ['v1', 'operations', 'access', 'roles'],
  ['v1', 'operations', 'access', 'assignments']
]) {
  assert.ok(resolveProtectedRoute('GET', segments, new URLSearchParams()));
  assert.equal(resolveProtectedRoute('GET', segments, new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')), null);
}
for (const action of ['grant', 'revoke']) {
  assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'access', 'users', userId, action], new URLSearchParams()));
  assert.equal(resolveProtectedRoute('POST', ['v1', 'operations', 'access', 'users', 'not-a-uuid', action], new URLSearchParams()), null);
}
assert.equal(resolveProtectedRoute('POST', ['v1', 'operations', 'access', 'users', userId, 'delete'], new URLSearchParams()), null);

const apiSource = readFileSync(new URL('./operations-access-api.ts', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../components/operations-access-panel.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../app/[locale]/operations/access/page.tsx', import.meta.url), 'utf8');
const operationsPage = readFileSync(new URL('../app/[locale]/operations/page.tsx', import.meta.url), 'utf8');

assert.match(apiSource, /\/v1\/operations\/access\/me/);
assert.match(apiSource, /\/v1\/operations\/access\/roles/);
assert.match(apiSource, /\/v1\/operations\/access\/assignments/);
assert.match(apiSource, /\/grant/);
assert.match(apiSource, /\/revoke/);
assert.match(panelSource, /roles\.manage/);
assert.match(panelSource, /You cannot change your own roles/);
assert.match(panelSource, /Role revoked and retained in the audit history/);
assert.match(pageSource, /OperationsAccessPanel/);
assert.match(operationsPage, /operations\/access/);

console.log('Administrative web access surface tests passed.');
