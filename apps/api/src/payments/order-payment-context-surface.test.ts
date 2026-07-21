import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL(
    '../../../../infra/db/migrations/008_order_payment_context.sql',
    import.meta.url
  ),
  'utf8'
);
const route = readFileSync(
  new URL('../routes/order-payment-context.ts', import.meta.url),
  'utf8'
);
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert.match(
  migration,
  /ADD COLUMN transaction_id uuid REFERENCES transactions\(id\) ON DELETE RESTRICT/
);
assert.match(migration, /payment_intents_transaction_source_check/);
assert.match(migration, /CREATE UNIQUE INDEX payment_intents_transaction_idx/);
assert.match(migration, /CREATE UNIQUE INDEX fulfilments_payment_intent_unique_idx/);
assert.match(migration, /transaction\.payment_provider IS NULL/);
assert.match(migration, /transaction\.payment_reference IS NULL/);
assert.match(migration, /WHEN 'xmr' THEN 'crypto_xmr'/);
assert.match(migration, /WHEN 'paid' THEN 'held'/);
assert.match(migration, /CREATE FUNCTION create_order_payment_context\(\)/);
assert.match(migration, /AFTER INSERT ON transactions/);
assert.match(migration, /INSERT INTO payment_intents/);
assert.match(migration, /INSERT INTO fulfilments/);
assert.match(migration, /NEW\.payment_provider/);
assert.match(migration, /NEW\.payment_reference/);
assert.match(
  migration,
  /WHEN \(NEW\.payment_method IN \('card', 'bank_transfer', 'wallet', 'xmr'\)\)/
);

assert.match(
  route,
  /app\.get\(\s*'\/market\/orders\/:orderId\/payment-context'/
);
assert.match(route, /preHandler: requireUser/);
assert.match(
  route,
  /order\.buyer_id !== accountId && order\.seller_id !== accountId/
);
assert.match(route, /market\.orders\.payment_context\.account/);
assert.match(route, /market\.orders\.payment_context\.ip/);
assert.match(route, /selectFrom\('payment_intents'\)/);
assert.match(route, /where\('transaction_id', '=', order\.id\)/);
assert.match(route, /selectFrom\('fulfilments'\)/);
assert.match(route, /assertOrderPaymentContextMatches/);
assert.match(route, /presentOrderPaymentContext/);
assert.doesNotMatch(route, /app\.post\(/);

assert.match(
  server,
  /import \{ orderPaymentContextRoutes \} from '\.\/routes\/order-payment-context\.js'/
);
assert.match(
  server,
  /app\.register\(orderPaymentContextRoutes, \{ prefix: '\/v1' \}\)/
);
