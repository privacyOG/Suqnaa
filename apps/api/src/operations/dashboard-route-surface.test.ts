import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../routes/operations-dashboard.ts', import.meta.url), 'utf8');
const guard = readFileSync(new URL('../auth/require-operations-user.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(route, /\/operations\/dashboard/);
assert.match(route, /moderation\.queue\.read/);
assert.match(route, /moderation\.account\.manage/);
assert.match(route, /moderation\.listing\.manage/);
assert.match(route, /verification\.read/);
assert.match(route, /disputes\.read/);
assert.match(route, /payments\.read/);
assert.match(route, /settlements\.read/);
assert.match(route, /existing_reports_and_chargebacks/);
assert.match(route, /audit_logs/);
assert.match(route, /order_returns/);
assert.match(route, /seller_settlements/);
assert.doesNotMatch(route, /selectAll\(\)/);

assert.match(guard, /operations\\\/dashboard/);
assert.match(guard, /permission: 'operations\.access'/);
assert.match(server, /operationsDashboardRoutes/);
assert.match(server, /app\.register\(operationsDashboardRoutes/);

console.log('Operations dashboard route surface passed.');
