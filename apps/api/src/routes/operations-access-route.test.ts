import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./operations-access.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(source, /get\('\/operations\/access\/me', \{ preHandler: requirePermission\('operations\.access'\) \}/);
assert.match(source, /get\('\/operations\/access\/roles', \{ preHandler: requirePermission\('roles\.read'\) \}/);
assert.match(source, /get\('\/operations\/access\/assignments', \{ preHandler: requirePermission\('roles\.read'\) \}/);
assert.match(source, /post\('\/operations\/access\/users\/:userId\/grant', \{ preHandler: requirePermission\('roles\.manage'\) \}/);
assert.match(source, /post\('\/operations\/access\/users\/:userId\/revoke', \{ preHandler: requirePermission\('roles\.manage'\) \}/);
assert.match(source, /grantAdministrativeRole/);
assert.match(source, /revokeAdministrativeRole/);
assert.match(server, /register\(operationsAccessRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Administrative access route surface tests passed.');
