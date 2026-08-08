import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const paymentRoute = readFileSync(
  new URL('../routes/payments.ts', import.meta.url),
  'utf8'
);
const webhookRoute = readFileSync(
  new URL('../routes/stripe-payment-events.ts', import.meta.url),
  'utf8'
);
const serverSource = readFileSync(
  new URL('../server.ts', import.meta.url),
  'utf8'
);

assert.match(paymentRoute, /preHandler:\s*requireUser/);
assert.match(paymentRoute, /evaluateInitialLaunchPayment/);
assert.match(paymentRoute, /beginStripeCheckout/);
assert.match(paymentRoute, /buyer\.email_verified_at/);
assert.match(paymentRoute, /order\.amount/);
assert.match(paymentRoute, /order\.currency_code/);
assert.doesNotMatch(paymentRoute, /amount:\s*z\./);
assert.doesNotMatch(paymentRoute, /currencyCode:\s*z\./);
assert.doesNotMatch(paymentRoute, /sellerId:\s*z\./);

assert.match(webhookRoute, /parseAs:\s*'buffer'/);
assert.match(webhookRoute, /stripe-signature/);
assert.match(webhookRoute, /verifyAndParseStripeWebhook/);
assert.match(webhookRoute, /applyStripePaymentSucceeded/);
assert.doesNotMatch(webhookRoute, /requireUser/);
assert.doesNotMatch(webhookRoute, /webhookSecret[^\n]*log/i);

assert.match(serverSource, /stripePaymentEventRoutes/);
assert.match(serverSource, /register\(stripePaymentEventRoutes/);
