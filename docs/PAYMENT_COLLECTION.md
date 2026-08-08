# Buyer payment collection

Status: P0-22 implementation boundary.

This document describes the first actual buyer-payment collection path. It is subordinate to `INITIAL_LAUNCH_POLICY.md`: Australia (`AU`) and Australian dollars (`AUD`) remain the only initial live marketplace boundary, and production payment collection remains subject to the legal/commercial approval gate recorded there.

## Provider and funds model

Stripe-hosted Checkout is the first implemented collection provider. Suqnaa does not collect raw card details and does not operate a stored-value balance or its own escrow account.

P0-22 uses a separate-charges-and-transfers style boundary:

1. Suqnaa creates a provider-hosted Checkout Session from the immutable stored order.
2. The resulting Stripe PaymentIntent includes a `transfer_group` tied to the Suqnaa order.
3. Successful provider evidence moves the Suqnaa order to `paid` and the internal payment intent to `held`.
4. P0-22 does **not** create a seller transfer, payout, release, refund, or dispute transition.
5. P0-23 owns separately authorised release/refund/chargeback/compliance-hold transitions.
6. P0-24 owns seller payout onboarding, settlement, fees, ledgering, and reconciliation.

The internal term `held` records verified collected funds that are not yet authorised for seller release. It does not assert that Suqnaa itself has taken custody of regulated client money.

## Protected checkout

Authenticated buyers continue to call:

`POST /v1/payments/protected-checkout`

The request contains only:

- the stored order UUID;
- a bounded locale used for the trusted return route;
- the existing human-verification header when enabled.

The client does **not** supply payment amount, currency, seller, listing, or provider identifiers. The API derives them from the stored transaction and validates:

- buyer ownership;
- active buyer and seller accounts;
- reserved listing state;
- pending order state;
- no existing conflicting payment-provider evidence;
- the AU/AUD launch-policy boundary;
- an approved launch payment method (`card` or provider-tokenised wallet);
- a verified buyer email before provider collection;
- the existing internal payment-intent/order consistency contract.

When `PAYMENT_COLLECTION_PROVIDER=none`, the route preserves the previous disabled `configuration_required` response and no network request to Stripe is made.

When Stripe test/live collection is configured, the route creates or reuses a hosted Checkout Session and returns `redirect_required` with a provider Checkout URL. Web and mobile clients accept only HTTPS URLs under `checkout.stripe.com` before navigation.

## Amount and idempotency

The Checkout Session is created server-side from the stored order amount and `AUD` currency. Decimal AUD amounts are converted to integer cents without floating-point rounding.

The provider request uses the stable idempotency key:

`suqnaa-checkout-v1-<internal-payment-intent-uuid>`

The same internal payment intent therefore maps to the same logical Checkout Session creation request across retries. A durable `payment_collection_sessions` row records the provider session and expiry.

## Stripe Checkout contract

The provider request uses:

- Checkout `mode=payment`;
- card payment method, which allows provider-supported tokenised device wallets where available;
- the verified buyer email;
- `payment_intent_data[receipt_email]`;
- `payment_intent_data[transfer_group]=suqnaa_order_<order UUID>`;
- internal order, payment-intent, listing, and seller UUIDs in provider metadata;
- trusted success/cancel URLs derived from the configured Suqnaa web origin.

No seller transfer or destination is supplied by P0-22.

The integration currently sends Stripe API version `2026-02-25.clover` explicitly so provider behaviour does not silently change with an account default API-version update.

## Signed webhook boundary

Stripe payment success is accepted only at:

`POST /v1/payments/stripe-events`

The endpoint must be configured to receive `payment_intent.succeeded` events for this implementation boundary.

The route reads the **raw request body** and verifies the `Stripe-Signature` HMAC before JSON parsing. The signed timestamp must be within the configured five-minute tolerance. The webhook `livemode` flag must match whether the configured secret key is test or live.

A valid event still does not automatically mutate marketplace state. The API transaction-locks the stored payment intent and order and checks all of the following against provider evidence:

- internal payment-intent UUID metadata;
- order UUID;
- listing UUID;
- seller UUID;
- AUD currency;
- exact stored amount in cents;
- full amount received;
- expected `transfer_group`;
- stored payment method and payment rail;
- existing provider references and current lifecycle state;
- provider charge identifier used for the receipt.

Only then may a pending order become `paid`. The existing database synchronization trigger moves the matching internal payment intent to `held` and copies the exact provider/payment reference.

## Replay protection

Stripe event IDs are written into the existing durable `payment_provider_events` ledger using provider `stripe` and the internal semantic event type `payment.held`.

A retry of the same Stripe event ID is accepted only if its payment-intent ID, provider reference, and SHA-256 semantic fingerprint match the original event. Conflicting reuse is rejected. This keeps provider retries idempotent and prevents a replay identifier from being rebound to a different payment.

## Receipts

After a verified payment-success event, the server retrieves the corresponding Stripe Charge using the server-side secret key and stores only bounded receipt metadata:

- provider;
- Stripe PaymentIntent reference;
- Stripe Charge reference;
- HTTPS receipt URL when supplied;
- provider receipt number when supplied;
- issue time.

The buyer-facing order payment-context endpoint exposes this receipt metadata only to the buyer. Sellers do not receive the buyer receipt URL through that endpoint. The verified buyer email is also supplied as the provider receipt email for the collected payment.

## Configuration

Default/disabled:

```text
PAYMENT_COLLECTION_PROVIDER=none
PAYMENT_COLLECTION_WEB_ORIGIN=http://localhost:3000
PAYMENT_COLLECTION_TIMEOUT_MS=8000
PAYMENT_COLLECTION_LIVE_APPROVED=false
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Test mode requires:

- `PAYMENT_COLLECTION_PROVIDER=stripe`;
- a Stripe `sk_test_...` secret key;
- the matching webhook endpoint secret;
- a trusted payment-return web origin.

A Stripe live secret key is rejected at startup unless **both**:

- `NODE_ENV=production`; and
- `PAYMENT_COLLECTION_LIVE_APPROVED=true`.

That flag is an engineering interlock, not legal approval by itself. Operators must not set it until the P0-21 legal/commercial/provider approval requirements have actually been satisfied.

## Security and privacy rules

- Raw PAN, CVV/CVC, bank credentials, provider secret keys, and webhook secrets are never stored in marketplace tables or returned to clients.
- Provider URLs are validated before client navigation.
- Provider errors returned to clients are generic; secret-bearing provider responses are not logged.
- Amount/currency/seller/listing identity are always derived from the stored order.
- Webhook signature verification happens against the unmodified body.
- Provider success alone cannot release funds to a seller.
- Virtual-asset rails, direct bank transfer, and Suqnaa stored-value balances remain outside this implementation.

## Operational setup

Before enabling a Stripe test environment, configure a webhook endpoint for the exact public API URL ending in `/v1/payments/stripe-events` and subscribe it to `payment_intent.succeeded` for this P0-22 boundary. Store the endpoint secret and API secret outside source control.

Before enabling live collection, complete the P0-21 legal/commercial review, confirm the exact Stripe account and Connect/funds-flow configuration, validate the production webhook endpoint, run the complete staging payment journey, and keep seller release/payout disabled until P0-23/P0-24 are independently complete.
