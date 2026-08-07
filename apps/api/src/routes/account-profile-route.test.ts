import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./account-profile.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(source, /get\('\/account\/profile', \{ preHandler: requireUser \}/);
assert.match(source, /post\('\/account\/profile', \{ preHandler: requireUser \}/);
assert.match(source, /get\('\/profiles\/:userId'/);
assert.match(source, /get\('\/account\/profile\/avatar', \{ preHandler: requireUser \}/);
assert.match(source, /post\(\s*'\/account\/profile\/avatar\/upload'/);
assert.match(source, /post\('\/account\/profile\/avatar\/delete', \{ preHandler: requireUser \}/);
assert.match(source, /get\('\/account\/export', \{ preHandler: requireUser \}/);
assert.match(source, /post\('\/account\/closure', \{ preHandler: requireUser \}/);
assert.match(source, /profile_visibility === 'private'/);
assert.doesNotMatch(source, /email.*\/profiles\/:userId/);
assert.match(server, /accountProfileRoutes/);
assert.match(server, /register\(accountProfileRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Account profile route surface tests passed.');
