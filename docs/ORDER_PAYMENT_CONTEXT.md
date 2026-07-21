# Order payment context

## Purpose

Every marketplace order needs a durable payment and fulfilment context before payment-provider integration or fulfilment acknowledgements are enabled.

This foundation links:

- one marketplace transaction;
- one provider-neutral payment intent; and
- one fulfilment record.

The linkage does not collect funds, create provider instructions, mark an order paid, release funds, or resolve disputes.

## Database invariants

Migration `008_order_payment_context.sql` adds a nullable `transaction_id` foreign key to `payment_intents` and enforces:

- at most one payment intent per marketplace transaction;
- at most one fulfilment record per payment intent;
- transaction-linked intents cannot also be auction-linked; and
- supported transaction inserts create their payment intent and fulfilment record inside the same PostgreSQL transaction.

The order payment method maps to the internal payment rail as follows:

| Order payment method | Payment rail |
| --- | --- |
| `card` | `card` |
| `bank_transfer` | `bank_transfer` |
| `wallet` | `wallet` |
| `xmr` | `crypto_xmr` |

The initial fulfilment status is always `not_started`.

## Existing orders

The migration backfills orders only when:

- the stored payment method is supported;
- no payment provider is stored on the transaction; and
- no payment reference is stored on the transaction.

This avoids guessing whether a previously configured payment record corresponds to an existing payment intent. Previously configured orders without an explicit linkage require controlled reconciliation rather than automatic duplication.

Existing transaction statuses map conservatively to payment statuses:

| Transaction status | Payment status |
| --- | --- |
| `pending` | `created` |
| `paid` | `held` |
| `released` | `released` |
| `refunded` | `refunded` |
| `disputed` | `disputed` |
| `cancelled` | `cancelled` |

This mapping preserves the stored marketplace state; it is not evidence of an external provider event.

## Participant read endpoint

Authenticated buyers and sellers may read the context for their own order:

`GET /v1/market/orders/:orderId/payment-context`

The endpoint returns:

- payment intent identifier, rail and status;
- whether provider configuration exists;
- payment intent timestamps and expiry;
- fulfilment identifier, status and timestamps;
- the protected release model; and
- explicit disabled collection and release capabilities.

The endpoint does not return raw provider names, provider references, account credentials, payment addresses, wallet infrastructure, or operational secrets.

## Current safety boundary

The following operations remain disabled:

- collecting or confirming funds;
- changing payment intent status;
- marking a marketplace order paid;
- updating fulfilment status;
- confirming receipt;
- releasing funds;
- opening or resolving disputes; and
- refunding a payment.

Those capabilities require separate state-transition invariants, audit controls, participant authorization and production compliance review.
