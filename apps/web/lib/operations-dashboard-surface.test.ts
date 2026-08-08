import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/[locale]/operations/page.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('./operations-dashboard-server.ts', import.meta.url), 'utf8');

assert.match(server, /\/v1\/operations\/dashboard/);
assert.match(server, /cache: 'no-store'/);
assert.match(server, /authorization: `Bearer \$\{access\}`/);
assert.match(page, /Suqnaa administration dashboard/);
assert.match(page, /Operational workload/);
for (const surface of [
  'Reports',
  'Accounts',
  'Listings',
  'Categories',
  'Identity checks',
  'Disputes',
  'Payments',
  'Seller settlements',
  'Fulfilment & returns',
  'Fraud signals',
  'Audit review'
]) {
  assert.match(page, new RegExp(surface.replace(/[&]/g, '\\&')));
}
assert.match(page, /sections\.fraudSignals\.openFraudReports/);
assert.match(page, /sections\.fraudSignals\.openChargebacks/);
assert.match(page, /OperationsQueueBrowserPanel/);
assert.match(page, /OperationRecordsPanel/);

console.log('Administration dashboard web surface passed.');
