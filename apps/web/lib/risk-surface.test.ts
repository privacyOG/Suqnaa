import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProtectedRoute } from './protected-route-policy';

const page = readFileSync(new URL('../app/[locale]/operations/fraud/page.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/operations-risk-panel.tsx', import.meta.url), 'utf8');

assert.match(page, /OperationsRiskPanel/);
assert.match(page, /Risk and fraud signals/);
assert.match(panel, /risk\.read/);
assert.match(panel, /risk\.manage/);
assert.match(panel, /risk\.review/);
assert.match(panel, /\/v1\/operations\/risk\/rules/);
assert.match(panel, /\/v1\/operations\/risk\/signals\/\$\{signal\.id\}\/review/);
assert.match(panel, /\/v1\/operations\/risk\/reconcile-sources/);
assert.match(panel, /\/v1\/operations\/risk\/reconcile-observations/);
assert.match(panel, /do not execute moderation, payment, or settlement actions/);

const getSignals = resolveProtectedRoute('GET', ['v1', 'operations', 'risk', 'signals'], new URLSearchParams('status=open&limit=100'));
assert.equal(getSignals?.path, '/v1/operations/risk/signals');
assert.equal(getSignals?.query, 'status=open&limit=100');
const badQuery = resolveProtectedRoute('GET', ['v1', 'operations', 'risk', 'signals'], new URLSearchParams('secret=x'));
assert.equal(badQuery, null);
const review = resolveProtectedRoute('POST', ['v1', 'operations', 'risk', 'signals', '123e4567-e89b-12d3-a456-426614174000', 'review'], new URLSearchParams());
assert.equal(review?.path, '/v1/operations/risk/signals/123e4567-e89b-12d3-a456-426614174000/review');
const sourceReconcile = resolveProtectedRoute('POST', ['v1', 'operations', 'risk', 'reconcile-sources'], new URLSearchParams());
assert.equal(sourceReconcile?.path, '/v1/operations/risk/reconcile-sources');

console.log('Risk operations web surface passed.');
