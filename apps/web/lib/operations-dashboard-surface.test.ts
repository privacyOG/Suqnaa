import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/[locale]/operations/page.tsx', import.meta.url), 'utf8');
const summaryServer = readFileSync(new URL('./operations-dashboard-server.ts', import.meta.url), 'utf8');
const reviewServer = readFileSync(new URL('./operations-review-server.ts', import.meta.url), 'utf8');
const categoriesPage = readFileSync(new URL('../app/[locale]/operations/categories/page.tsx', import.meta.url), 'utf8');
const financePage = readFileSync(new URL('../app/[locale]/operations/finance/page.tsx', import.meta.url), 'utf8');
const fulfilmentPage = readFileSync(new URL('../app/[locale]/operations/fulfilment/page.tsx', import.meta.url), 'utf8');
const fraudPage = readFileSync(new URL('../app/[locale]/operations/fraud/page.tsx', import.meta.url), 'utf8');

assert.match(summaryServer, /\/v1\/operations\/dashboard/);
assert.match(summaryServer, /cache: 'no-store'/);
assert.match(summaryServer, /authorization: `Bearer \$\{access\}`/);
assert.match(reviewServer, /\/v1\/operations\/dashboard\/categories/);
assert.match(reviewServer, /\/v1\/operations\/dashboard\/fulfilment/);
assert.match(reviewServer, /\/v1\/operations\/dashboard\/fraud/);
assert.match(reviewServer, /\/v1\/operations\/payments\?limit=100/);
assert.match(reviewServer, /\/v1\/operations\/settlements\?limit=100/);
assert.match(page, /Suqnaa administration dashboard/);
assert.match(page, /Operational workload/);
for (const surface of [
  'Reports', 'Accounts', 'Listings', 'Categories', 'Identity checks', 'Disputes',
  'Payments', 'Seller settlements', 'Fulfilment & returns', 'Fraud signals', 'Audit review'
]) {
  assert.match(page, new RegExp(surface.replace(/[&]/g, '\\&')));
}
assert.match(page, /operations\/categories/);
assert.match(page, /operations\/finance/);
assert.match(page, /operations\/fulfilment/);
assert.match(page, /operations\/fraud/);
assert.match(page, /sections\.fraudSignals\.openFraudReports/);
assert.match(page, /sections\.fraudSignals\.openChargebacks/);
assert.match(page, /OperationsQueueBrowserPanel/);
assert.match(page, /OperationRecordsPanel/);
assert.match(categoriesPage, /Category inventory/);
assert.match(categoriesPage, /P0-29/);
assert.match(financePage, /Payments & seller settlements/);
assert.match(financePage, /separate payment permissions/);
assert.match(fulfilmentPage, /Fulfilment & returns/);
assert.match(fulfilmentPage, /without bypassing dispute or payment authorisation workflows/);
assert.match(fraudPage, /Fraud signals/);
assert.match(fraudPage, /P0-30/);

console.log('Administration dashboard web surface passed.');
