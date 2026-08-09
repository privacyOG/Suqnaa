import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync(new URL('../deploy/Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../deploy/compose.production.yml', import.meta.url), 'utf8');
const dockerignore = readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8');

for (const target of ['api', 'worker', 'web', 'migrate']) {
  assert.match(dockerfile, new RegExp(`FROM [^\\n]+ AS ${target}\\b`), `missing Docker target: ${target}`);
}

assert.match(dockerfile, /pnpm install --frozen-lockfile/);
assert.match(dockerfile, /pnpm install --frozen-lockfile --prod/);
assert.match(dockerfile, /USER node/g);
assert.match(dockerfile, /postgresql-client/);
assert.match(dockerfile, /scripts\/migrate-database\.mjs/);
assert.match(dockerfile, /apps\/api\/dist\/server\.js/);
assert.match(dockerfile, /next[^\n]+start/);

for (const service of [
  'api',
  'web',
  'worker-listings',
  'worker-discovery',
  'worker-notifications',
  'worker-settlements',
  'worker-disputes',
  'worker-returns',
  'migrate'
]) {
  assert.match(compose, new RegExp(`^  ${service}:`, 'm'), `missing production service: ${service}`);
}

for (const worker of [
  'listing-lifecycle-worker.js',
  'discovery-notification-worker.js',
  'notification-delivery-worker.js',
  'seller-settlement-worker.js',
  'dispute-deadline-worker.js',
  'return-deadline-worker.js'
]) {
  assert.match(compose, new RegExp(worker.replace('.', '\\.')));
}

assert.match(compose, /NEXT_PUBLIC_API_BASE_URL is required at web build time/);
assert.match(compose, /no-new-privileges:true/);
assert.match(compose, /cap_drop:\n\s+- ALL/);
assert.doesNotMatch(compose, /POSTGRES_PASSWORD|S3_SECRET_KEY|JWT_ACCESS_SECRET/);
assert.match(dockerignore, /^\.env\.\*$/m);
assert.match(dockerignore, /^node_modules$/m);
assert.match(dockerignore, /^apps\/mobile$/m);

console.log('Production container topology surface passed.');
