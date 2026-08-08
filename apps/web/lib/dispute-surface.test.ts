import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('./dispute-api.ts', import.meta.url), 'utf8');
const operationsApi = readFileSync(new URL('./operations-dispute-api.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/order-dispute-panel.tsx', import.meta.url), 'utf8');
const operationsPanel = readFileSync(new URL('../components/operations-dispute-panel.tsx', import.meta.url), 'utf8');
const orderPage = readFileSync(new URL('../app/[locale]/activity/orders/[orderId]/page.tsx', import.meta.url), 'utf8');
const operationsPage = readFileSync(new URL('../app/[locale]/operations/disputes/page.tsx', import.meta.url), 'utf8');

assert.match(api, /postAuthedBinary/);
assert.match(api, /protectedEvidenceHref/);
assert.match(api, /\/api\/authed/);
assert.match(api, /participant_statement/);
assert.match(panel, /active dispute blocks seller settlement/i);
assert.match(panel, /separate payment authorization/i);
assert.match(panel, /image\/jpeg,image\/png,image\/webp,application\/pdf/);
assert.match(panel, /Private download/);
assert.match(panel, /Submit appeal/);
assert.match(orderPage, /OrderDisputePanel/);

assert.match(operationsApi, /\/v1\/operations\/disputes/);
assert.match(operationsApi, /resolveOperationsDispute/);
assert.match(operationsPanel, /final payment approval remains separate/i);
assert.match(operationsPanel, /Request buyer info/);
assert.match(operationsPanel, /Request seller info/);
assert.match(operationsPanel, /Record resolution/);
assert.match(operationsPanel, /Appeal review/);
assert.match(operationsPage, /OperationsDisputePanel/);

console.log('Web dispute participant and operations surfaces passed.');
