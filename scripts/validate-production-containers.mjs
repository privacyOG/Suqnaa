import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync(new URL('../deploy/Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../deploy/compose.production.yml', import.meta.url), 'utf8');
const dockerignore = readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8');
const healthRoute = readFileSync(new URL('../apps/api/src/routes/health.ts', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../apps/api/src/deployment/readiness.ts', import.meta.url), 'utf8');
const releaseScript = readFileSync(new URL('../deploy/release.sh', import.meta.url), 'utf8');
const rollbackScript = readFileSync(new URL('../deploy/rollback.sh', import.meta.url), 'utf8');
const reliabilityRunbook = readFileSync(new URL('../docs/DEPLOYMENT_RELIABILITY.md', import.meta.url), 'utf8');

for (const target of ['api', 'worker', 'web', 'migrate']) {
  assert.match(dockerfile, new RegExp(`FROM [^\\n]+ AS ${target}\\b`), `missing Docker target: ${target}`);
}

assert.match(dockerfile, /pnpm install --frozen-lockfile/);
assert.match(dockerfile, /pnpm install --frozen-lockfile --prod/);
assert.match(dockerfile, /FROM source AS web-build\nENV NODE_ENV=production/);
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

const apiBlock = compose.match(/^  api:[\s\S]*?(?=^  web:)/m)?.[0] ?? '';
const webBlock = compose.match(/^  web:[\s\S]*?(?=^  worker-listings:)/m)?.[0] ?? '';
const workerAnchor = compose.match(/^x-worker:[\s\S]*?(?=^services:)/m)?.[0] ?? '';
assert.match(apiBlock, /healthcheck:/);
assert.match(apiBlock, /\/v1\/health\/ready/);
assert.match(webBlock, /healthcheck:/);
assert.match(webBlock, /127\.0\.0\.1:3000/);
assert.match(workerAnchor, /healthcheck:/);
assert.match(workerAnchor, /process\.kill\(1,0\)/);
assert.match(healthRoute, /\/health\/live/);
assert.match(healthRoute, /\/health\/ready/);
assert.match(healthRoute, /reply\.code\(503\)/);
assert.match(readiness, /timeoutMs \?\? 2_000/);
assert.match(readiness, /Promise\.race/);

for (const imageVariable of [
  'SUQNAA_API_IMAGE',
  'SUQNAA_WEB_IMAGE',
  'SUQNAA_WORKER_IMAGE',
  'SUQNAA_MIGRATE_IMAGE'
]) {
  assert.ok(releaseScript.includes(imageVariable), `release script must require ${imageVariable}`);
}
assert.match(releaseScript, /config --quiet/);
assert.match(releaseScript, /--profile migrate run --rm --no-deps migrate/);
assert.match(releaseScript, /up -d --no-build --remove-orphans --wait --wait-timeout/);
assert.match(releaseScript, /\/v1\/health\/ready/);
assert.match(rollbackScript, /PREVIOUS_API_IMAGE/);
assert.match(rollbackScript, /PREVIOUS_WEB_IMAGE/);
assert.match(rollbackScript, /PREVIOUS_WORKER_IMAGE/);
assert.match(rollbackScript, /SUQNAA_RUN_MIGRATIONS=false/);
assert.match(rollbackScript, /exec bash .*release\.sh/);

assert.match(reliabilityRunbook, /expand\/contract policy/i);
assert.match(reliabilityRunbook, /rollback compatibility window/i);
assert.match(reliabilityRunbook, /SEV-1/);
assert.match(reliabilityRunbook, /SEV-2/);
assert.match(reliabilityRunbook, /Security\/privacy owner/);
assert.match(reliabilityRunbook, /Payments\/finance owner/);
assert.match(reliabilityRunbook, /Legal\/compliance owner/);
assert.match(reliabilityRunbook, /P1-06 encrypted backup\/restore runbook/);

assert.match(dockerignore, /^\.env\.\*$/m);
assert.match(dockerignore, /^node_modules$/m);
assert.match(dockerignore, /^apps\/mobile$/m);

console.log('Production container topology surface passed.');
