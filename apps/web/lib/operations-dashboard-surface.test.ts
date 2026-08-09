import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/[locale]/operations/page.tsx', import.meta.url), 'utf8');
const summaryServer = readFileSync(new URL('./operations-dashboard-server.ts', import.meta.url), 'utf8');
const reviewServer = readFileSync(new URL('./operations-review-server.ts', import.meta.url), 'utf8');
const financeApi = readFileSync(new URL('./operations-finance-api.ts', import.meta.url), 'utf8');
const financeActions = readFileSync(new URL('../components/operations-finance-actions.tsx', import.meta.url), 'utf8');
const accountsPage = readFileSync(new URL('../app/[locale]/operations/accounts/page.tsx', import.meta.url), 'utf8');
const listingsPage = readFileSync(new URL('../app/[locale]/operations/listings/page.tsx', import.meta.url), 'utf8');
const categoriesPage = readFileSync(new URL('../app/[locale]/operations/categories/page.tsx', import.meta.url), 'utf8');
const financePage = readFileSync(new URL('../app/[locale]/operations/finance/page.tsx', import.meta.url), 'utf8');
const fulfilmentPage = readFileSync(new URL('../app/[locale]/operations/fulfilment/page.tsx', import.meta.url), 'utf8');
const fraudPage = readFileSync(new URL('../app/[locale]/operations/fraud/page.tsx', import.meta.url), 'utf8');

assert.match(summaryServer, /\/v1\/operations\/dashboard/);
assert.match(summaryServer, /cache: 'no-store'/);
assert.match(summaryServer, /authorization: `Bearer \$\{access\}`/);
for (const path of [
  'dashboard\\/accounts', 'dashboard\\/listings', 'dashboard\\/categories',
  'dashboard\\/fulfilment', 'dashboard\\/fraud'
]) assert.match(reviewServer, new RegExp(path));
assert.match(reviewServer, /\/v1\/operations\/payments\?limit=100/);
assert.match(reviewServer, /\/v1\/operations\/settlements\?limit=100/);

assert.match(page, /Suqnaa administration dashboard/);
assert.match(page, /Operational workload/);
for (const surface of [
  'Reports', 'Accounts', 'Listings', 'Categories', 'Identity checks', 'Disputes',
  'Payments', 'Seller settlements', 'Fulfilment & returns', 'Fraud signals', 'Audit review'
]) assert.match(page, new RegExp(surface.replace(/[&]/g, '\\&')));
for (const path of ['accounts', 'listings', 'categories', 'finance', 'fulfilment', 'fraud']) {
  assert.match(page, new RegExp(`operations\\/${path}`));
}
assert.match(page, /OperationsQueueBrowserPanel/);
assert.match(page, /OperationRecordsPanel/);

assert.match(accountsPage, /Recent accounts/);
assert.match(accountsPage, /P0-29/);
assert.doesNotMatch(accountsPage, /emailVerified \? row\.email/);
assert.match(listingsPage, /Recent listings/);
assert.match(listingsPage, /P0-29/);
assert.match(categoriesPage, /Category inventory/);
assert.match(categoriesPage, /P0-29/);
assert.match(financePage, /Payments & seller settlements/);
assert.match(financePage, /OperationsFinanceActions/);
assert.match(financeActions, /payments\.approve/);
assert.match(financeActions, /settlements\.run/);
assert.match(financeActions, /requestedBy === userId/);
assert.match(financeActions, /A different authorised operator must decide this request/);
assert.match(financeApi, /payment-operations\/\$\{encodeURIComponent\(operationId\)\}\/decision/);
assert.match(financeApi, /\/v1\/operations\/settlements\/run/);
assert.match(fulfilmentPage, /Fulfilment & returns/);
assert.match(fulfilmentPage, /without bypassing dispute or payment authorisation workflows/);
assert.match(fraudPage, /Risk and fraud signals/);
assert.match(fraudPage, /Persisted risk signals/);
assert.match(fraudPage, /never directly suspends an account, removes a listing, or moves money/);

console.log('Administration dashboard web surface passed.');
