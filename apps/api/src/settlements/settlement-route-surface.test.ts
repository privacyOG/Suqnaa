import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sellerRoutes = readFileSync(new URL('../routes/seller-payouts.ts', import.meta.url), 'utf8');
const operationsRoutes = readFileSync(new URL('../routes/operations-settlements.ts', import.meta.url), 'utf8');
const connectRoutes = readFileSync(new URL('../routes/stripe-connect-events.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/require-operations-user.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../../infra/db/migrations/029_seller_settlement.sql', import.meta.url), 'utf8');

assert.match(sellerRoutes, /\/account\/payouts/);
assert.match(sellerRoutes, /\/account\/payouts\/onboarding/);
assert.match(sellerRoutes, /\/account\/payouts\/schedule/);
assert.match(sellerRoutes, /requireUser/);
assert.match(operationsRoutes, /\/operations\/settlements/);
assert.match(operationsRoutes, /requireOperationsUser/);
assert.match(connectRoutes, /\/payments\/stripe-connect-events/);
assert.match(connectRoutes, /parseAs: 'buffer'/);
assert.match(connectRoutes, /verifyAndParseStripeConnectWebhook/);
assert.match(server, /register\(sellerPayoutRoutes/);
assert.match(server, /register\(stripeConnectEventRoutes/);
assert.match(server, /register\(operationsSettlementRoutes/);
assert.match(permissions, /settlements\.read/);
assert.match(permissions, /settlements\.run/);
assert.match(migration, /CREATE TABLE seller_payout_accounts/);
assert.match(migration, /CREATE TABLE seller_settlements/);
assert.match(migration, /CREATE TABLE settlement_ledger_entries/);
assert.match(migration, /CREATE TABLE settlement_reversals/);
assert.doesNotMatch(migration, /bank_account|account_number|routing_number/i);

console.log('Seller settlement route surface tests passed.');
