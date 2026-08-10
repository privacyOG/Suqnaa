import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const infrastructure = readFileSync(new URL('../deploy/compose.infrastructure.yml', import.meta.url), 'utf8');
const application = readFileSync(new URL('../deploy/compose.production.yml', import.meta.url), 'utf8');
const caddy = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
const secretContract = readFileSync(new URL('../deploy/secrets/README.md', import.meta.url), 'utf8');
const prometheus = readFileSync(new URL('../deploy/observability/prometheus.yml', import.meta.url), 'utf8');
const alerts = readFileSync(new URL('../deploy/observability/rules/suqnaa-alerts.yml', import.meta.url), 'utf8');
const alertmanager = readFileSync(new URL('../deploy/observability/alertmanager.yml', import.meta.url), 'utf8');
const grafanaDatasource = readFileSync(
  new URL('../deploy/observability/grafana/provisioning/datasources/prometheus.yml', import.meta.url),
  'utf8'
);
const grafanaDashboard = readFileSync(
  new URL('../deploy/observability/grafana/dashboards/suqnaa-api-overview.json', import.meta.url),
  'utf8'
);

for (const service of [
  'postgres',
  'redis',
  'queue',
  'object-storage',
  'prometheus',
  'alertmanager',
  'grafana',
  'edge'
]) {
  assert.match(infrastructure, new RegExp(`^  ${service}:`, 'm'), `missing infrastructure service: ${service}`);
}

assert.match(infrastructure, /postgis\/postgis:/);
assert.match(infrastructure, /POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\/postgres_password/);
assert.match(infrastructure, /redis-server[\s\S]+--appendonly yes[\s\S]+--requirepass/);
assert.match(infrastructure, /^  queue:[\s\S]*?--appendfsync always[\s\S]*?--maxmemory-policy noeviction/m);
assert.match(infrastructure, /minio\/minio:/);
assert.match(infrastructure, /object_storage_data:\/data/);
assert.match(infrastructure, /postgres_data:\/var\/lib\/postgresql\/data/);
assert.match(infrastructure, /redis_data:\/data/);
assert.match(infrastructure, /queue_data:\/data/);
assert.match(infrastructure, /prometheus_data:\/prometheus/);
assert.match(infrastructure, /alertmanager_data:\/alertmanager/);
assert.match(infrastructure, /grafana_data:\/var\/lib\/grafana/);
assert.match(infrastructure, /no-new-privileges:true/g);

for (const secret of [
  'postgres_password',
  'redis_password',
  'queue_password',
  'object_storage_root_user',
  'object_storage_root_password',
  'observability_metrics_token',
  'grafana_admin_password'
]) {
  assert.match(infrastructure, new RegExp(`^  ${secret}:`, 'm'), `missing external secret: ${secret}`);
  assert.ok(secretContract.includes(`\`${secret}\``), `secret contract does not document ${secret}`);
}
assert.match(application, /^  observability_metrics_token:/m);
assert.match(application, /OBSERVABILITY_METRICS_TOKEN_FILE:\s*\/run\/secrets\/observability_metrics_token/);

const postgresBlock = infrastructure.match(/^  postgres:[\s\S]*?(?=^  redis:)/m)?.[0] ?? '';
const redisBlock = infrastructure.match(/^  redis:[\s\S]*?(?=^  queue:)/m)?.[0] ?? '';
const queueBlock = infrastructure.match(/^  queue:[\s\S]*?(?=^  object-storage:)/m)?.[0] ?? '';
const storageBlock = infrastructure.match(/^  object-storage:[\s\S]*?(?=^  prometheus:)/m)?.[0] ?? '';
const prometheusBlock = infrastructure.match(/^  prometheus:[\s\S]*?(?=^  alertmanager:)/m)?.[0] ?? '';
const alertmanagerBlock = infrastructure.match(/^  alertmanager:[\s\S]*?(?=^  grafana:)/m)?.[0] ?? '';
const grafanaBlock = infrastructure.match(/^  grafana:[\s\S]*?(?=^  edge:)/m)?.[0] ?? '';
for (const [name, block] of [
  ['postgres', postgresBlock],
  ['redis', redisBlock],
  ['queue', queueBlock],
  ['object-storage', storageBlock],
  ['prometheus', prometheusBlock],
  ['alertmanager', alertmanagerBlock]
]) {
  assert.ok(block, `unable to inspect ${name} service block`);
  assert.doesNotMatch(block, /^\s+ports:/m, `${name} must not publish host ports`);
}
assert.match(grafanaBlock, /127\.0\.0\.1:\$\{SUQNAA_GRAFANA_PORT:-3001\}:3000/);
assert.doesNotMatch(grafanaBlock, /0\.0\.0\.0:/);

assert.match(prometheus, /metrics_path:\s*\/internal\/observability\/metrics/);
assert.match(prometheus, /credentials_file:\s*\/run\/secrets\/observability_metrics_token/);
assert.match(prometheus, /alertmanager:9093/);
assert.match(alerts, /alert:\s*SuqnaaApiUnavailable/);
assert.match(alerts, /alert:\s*SuqnaaApiHighErrorRate/);
assert.match(alerts, /alert:\s*SuqnaaApiSlowP95/);
assert.match(alertmanager, /receiver:\s*operations-console/);
assert.match(grafanaDatasource, /url:\s*http:\/\/prometheus:9090/);
const parsedDashboard = JSON.parse(grafanaDashboard);
assert.equal(parsedDashboard.uid, 'suqnaa-api-overview');
assert.ok(Array.isArray(parsedDashboard.panels) && parsedDashboard.panels.length >= 4);

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
assert.match(secretContract, /general Redis credential and durable queue credential must be distinct/);
assert.match(secretContract, /least-privilege identities/);
assert.match(secretContract, /observability_metrics_token/);
assert.match(secretContract, /grafana_admin_password/);

console.log('Production infrastructure topology surface passed.');
