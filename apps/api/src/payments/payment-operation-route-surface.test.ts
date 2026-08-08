import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const routes = readFileSync(
  fileURLToPath(new URL('../routes/operations-payments.ts', import.meta.url)),
  'utf8'
);
const auth = readFileSync(
  fileURLToPath(new URL('../auth/require-operations-user.ts', import.meta.url)),
  'utf8'
);
const server = readFileSync(
  fileURLToPath(new URL('../server.ts', import.meta.url)),
  'utf8'
);
const stripeEvents = readFileSync(
  fileURLToPath(new URL('../routes/stripe-payment-events.ts', import.meta.url)),
  'utf8'
);

assert.match(routes, /\/operations\/payments\/:orderId\/request/);
assert.match(routes, /\/operations\/payment-operations\/:operationId\/decision/);
assert.match(routes, /requireOperationsUser/);
assert.match(routes, /paymentCollectionConfigurationFromEnvironment/);
assert.match(auth, /payments\.read/);
assert.match(auth, /payments\.request/);
assert.match(auth, /payments\.approve/);
assert.match(server, /operationsPaymentRoutes/);
assert.match(stripeEvents, /applyStripeRefundEvent/);
assert.match(stripeEvents, /applyStripeDisputeEvent/);
assert.doesNotMatch(routes, /buyerId|sellerId|paymentReference/);
