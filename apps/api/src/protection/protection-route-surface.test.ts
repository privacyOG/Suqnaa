import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('./protection-policy.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('./protection-service.ts', import.meta.url), 'utf8');
const participantRoutes = readFileSync(new URL('../routes/order-protection.ts', import.meta.url), 'utf8');
const operationsRoutes = readFileSync(new URL('../routes/operations-disputes.ts', import.meta.url), 'utf8');
const permissionMap = readFileSync(new URL('../auth/require-operations-user.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../infra/db/migrations/033_buyer_seller_protection.sql', import.meta.url), 'utf8');

assert.match(policy, /au-marketplace-protection-v1/);
assert.match(policy, /itemIssueWindowDays = 7/);
assert.match(policy, /fallbackShippingWindowDays = 14/);
assert.match(policy, /post_payment_cancellation/);
assert.match(policy, /shipping_eta_max_days/);
assert.match(policy, /buyer_protection_requires_buyer_claim/);

assert.match(service, /requestPaymentOperation/);
assert.match(service, /kind,/);
assert.doesNotMatch(service, /updateTable\('payment_intents'\)/);
assert.match(service, /status: 'authorized'/);
assert.match(service, /status: 'in_transit'/);
assert.match(service, /status: 'contested'/);
assert.match(service, /status: 'expired'/);

assert.match(participantRoutes, /\/market\/orders\/:orderId\/protection/);
assert.match(participantRoutes, /\/market\/returns\/:returnId\/ship/);
assert.match(participantRoutes, /\/market\/returns\/:returnId\/receipt/);
assert.match(participantRoutes, /HTTPS URL required/);
assert.match(operationsRoutes, /evaluateDisputeProtectionEligibility/);
assert.match(operationsRoutes, /protection_not_eligible/);
assert.match(operationsRoutes, /\/operations\/returns\/:returnId\/resolve/);
assert.match(operationsRoutes, /\/operations\/returns\/reconcile-deadlines/);

assert.match(permissionMap, /operations\\\/returns\\\/reconcile-deadlines/);
assert.match(permissionMap, /permission: 'disputes\.review'/);
assert.match(permissionMap, /permission: 'disputes\.resolve'/);
assert.match(server, /orderProtectionRoutes/);

assert.match(migration, /CREATE TABLE order_protection_cases/);
assert.match(migration, /CREATE TABLE order_returns/);
assert.match(migration, /CREATE TABLE protection_events/);
assert.match(migration, /return_blocks_existing_settlement/);
assert.match(migration, /order_returns return_row/);

console.log('Buyer and seller protection route/policy surfaces passed.');
