import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(
  new URL('../routes/order-fulfilment.ts', import.meta.url),
  'utf8'
);
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../../../../infra/db/migrations/009_fulfilment_evidence_guards.sql',
    import.meta.url
  ),
  'utf8'
);

assert.match(
  route,
  /app\.post\(\s*'\/market\/orders\/:orderId\/fulfilment'/
);
assert.match(route, /preHandler: requireUser/);
assert.match(route, /z\.discriminatedUnion\('action'/);
assert.match(route, /action: z\.literal\('ready_for_pickup'\)/);
assert.match(route, /action: z\.literal\('shipped'\)/);
assert.match(route, /action: z\.literal\('confirm_received'\)/);
assert.match(route, /carrier: z\.string\(\)\.trim\(\)\.min\(2\)\.max\(80\)/);
assert.match(
  route,
  /trackingReference: z\.string\(\)\.trim\(\)\.min\(3\)\.max\(160\)/
);
assert.match(route, /market\.orders\.fulfilment\.account/);
assert.match(route, /market\.orders\.fulfilment\.ip/);
assert.match(route, /fulfilment\.confirm/);
assert.match(route, /fulfilment\.manage/);
assert.match(route, /checkHumanProtectionWithChallenge/);
assert.match(route, /writeSecurityAudit/);
assert.match(
  route,
  /order\.buyer_id !== accountId && order\.seller_id !== accountId/
);
assert.match(route, /selectFrom\('payment_intents'\)/);
assert.match(route, /where\('transaction_id', '=', order\.id\)/);
assert.match(route, /intent\.provider && intent\.provider_reference/);
assert.match(route, /decideFulfilmentTransition/);
assert.match(route, /status: 'ready_for_pickup'/);
assert.match(route, /status: 'shipped'/);
assert.match(route, /status: 'received_confirmed'/);
assert.match(route, /buyer_confirmed_at: now/);
assert.match(route, /shipped_at: now/);
assert.match(route, /where\('status', '=', fulfilment\.status\)/);
assert.match(route, /Stored shipping details differ from this request/);
assert.match(route, /releaseEnabled: false/);
assert.doesNotMatch(route, /updateTable\('transactions'\)/);
assert.doesNotMatch(route, /updateTable\('payment_intents'\)/);

assert.match(
  server,
  /import \{ orderFulfilmentRoutes \} from '\.\/routes\/order-fulfilment\.js'/
);
assert.match(
  server,
  /app\.register\(orderFulfilmentRoutes, \{ prefix: '\/v1' \}\)/
);

assert.match(migration, /fulfilments_shipped_evidence_check/);
assert.match(migration, /shipped_at IS NOT NULL/);
assert.match(migration, /length\(btrim\(carrier\)\) BETWEEN 2 AND 80/);
assert.match(
  migration,
  /length\(btrim\(tracking_reference\)\) BETWEEN 3 AND 160/
);
assert.match(migration, /fulfilments_delivered_timestamp_check/);
assert.match(migration, /delivered_at IS NOT NULL/);
assert.match(migration, /fulfilments_buyer_confirmation_check/);
assert.match(migration, /buyer_confirmed_at IS NOT NULL/);
assert.match(migration, /NOT VALID/);
