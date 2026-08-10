import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../routes/observability.ts', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../../../../deploy/compose.production.yml', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../../../docs/OBSERVABILITY.md', import.meta.url), 'utf8');

assert.match(server, /disableRequestLogging:\s*true/);
assert.match(server, /registerHttpObservability\(app\)/);
assert.match(server, /apiLoggerOptions/);
assert.match(server, /getErrorReporter\(\)\.capture/);
assert.match(server, /observabilityRoutes, \{ prefix: '\/internal\/observability' \}/);
assert.doesNotMatch(server, /app\.log\.error\(error\)/);
assert.match(route, /loadMetricsAccessToken/);
assert.match(route, /metricsAuthorizationAllowed/);
assert.match(route, /httpMetrics\.renderPrometheus/);
assert.match(compose, /OBSERVABILITY_METRICS_TOKEN_FILE:\s*\/run\/secrets\/observability_metrics_token/);
assert.match(docs, /Recommended trace retention is 7 days/);
assert.match(docs, /routine application logs for no more than 14 days/);
assert.doesNotMatch(route, /request\.body|request\.ip|user-agent/i);

console.log('observability runtime surface ok');
