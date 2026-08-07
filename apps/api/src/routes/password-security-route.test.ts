import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./password-security.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(source, /post\('\/auth\/password\/forgot'/);
assert.match(source, /post\('\/auth\/password\/reset'/);
assert.match(source, /post\('\/account\/security\/password', \{ preHandler: requireUser \}/);
assert.match(source, /get\('\/account\/security\/sessions', \{ preHandler: requireUser \}/);
assert.match(source, /post\('\/account\/security\/sessions\/:sessionId\/revoke', \{ preHandler: requireUser \}/);
assert.match(source, /post\('\/account\/security\/sessions\/revoke-all', \{ preHandler: requireUser \}/);
assert.match(source, /account\.password_reset_request/);
assert.match(source, /passwordResetTargetFingerprint/);
assert.match(source, /return reply\.code\(202\)\.send\(\{ accepted: true \}\)/);
assert.doesNotMatch(source, /userId:\s*body\./);
assert.match(server, /passwordSecurityRoutes/);
assert.match(server, /register\(passwordSecurityRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Password security route surface tests passed.');
