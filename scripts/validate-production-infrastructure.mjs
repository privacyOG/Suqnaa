import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const infrastructure = readFileSync(new URL('../deploy/compose.infrastructure.yml', import.meta.url), 'utf8');
const application = readFileSync(new URL('../deploy/compose.production.yml', import.meta.url), 'utf8');
const caddy = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
const secretContract = readFileSync(new URL('../deploy/secrets/README.md', import.meta.url), 'utf8');

for (const service of ['postgres', 'redis', 'object-storage', 'edge']) {
  assert.match(infrastructure, new RegExp(`^  ${service}:`, 'm'), `missing infrastructure service: ${service}`);
}

assert.match(infrastructure, /postgis\/postgis:/);
assert.match(infrastructure, /POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\/postgres_password/);
assert.match(infrastructure, /redis-server[\s\S]+--appendonly yes[\s\S]+--requirepass/);
assert.match(infrastructure, /minio\/minio:/);
assert.match(infrastructure, /object_storage_data:\/data/);
assert.match(infrastructure, /postgres_data:\/var\/lib\/postgresql\/data/);
assert.match(infrastructure, /redis_data:\/data/);
assert.match(infrastructure, /no-new-privileges:true/g);

for (const secret of [
  'postgres_password',
  'redis_password',
  'object_storage_root_user',
  'object_storage_root_password'
]) {
  assert.match(infrastructure, new RegExp(`^  ${secret}:`, 'm'), `missing external secret: ${secret}`);
  assert.match(secretContract, new RegExp(`\\`${secret}\\``), `secret contract does not document ${secret}`);
}

const postgresBlock = infrastructure.match(/^  postgres:[\s\S]*?(?=^  redis:)/m)?.[0] ?? '';
const redisBlock = infrastructure.match(/^  redis:[\s\S]*?(?=^  object-storage:)/m)?.[0] ?? '';
const storageBlock = infrastructure.match(/^  object-storage:[\s\S]*?(?=^  edge:)/m)?.[0] ?? '';
for (const [name, block] of [
  ['postgres', postgresBlock],
  ['redis', redisBlock],
  ['object-storage', storageBlock]
]) {
  assert.ok(block, `unable to inspect ${name} service block`);
  assert.doesNotMatch(block, /^\s+ports:/m, `${name} must not publish host ports`);
}

assert.match(infrastructure, /^  edge:[\s\S]*?^    ports:\n\s+- "80:80"\n\s+- "443:443"/m);
assert.match(infrastructure, /^  application:[\s\S]*?internal: true/m);
assert.match(infrastructure, /SUQNAA_APPLICATION_NETWORK:-suqnaa-application/);
assert.match(application, /^  application:\n\s+external: true\n\s+name: \$\{SUQNAA_APPLICATION_NETWORK:-suqnaa-application\}/m);

assert.match(caddy, /\{\$SUQNAA_WEB_DOMAIN\}/);
assert.match(caddy, /\{\$SUQNAA_API_DOMAIN\}/);
assert.match(caddy, /reverse_proxy \{\$SUQNAA_WEB_UPSTREAM\}/);
assert.match(caddy, /reverse_proxy \{\$SUQNAA_API_UPSTREAM\}/);

assert.match(gitignore, /^deploy\/secrets\/\*$/m);
assert.match(gitignore, /^!deploy\/secrets\/README\.md$/m);
assert.match(secretContract, /Actual secret values are ignored by Git/);
assert.match(secretContract, /least-privilege identities/);

console.log('Production infrastructure topology surface passed.');
