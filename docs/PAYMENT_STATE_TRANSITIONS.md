# Payment state transitions

P0-23 introduces a durable, separately authorised payment-operation ledger for post-collection payment state changes.

## Scope

The supported operation kinds are:

- `release` — authorise the remaining seller amount for settlement. This does **not** create a seller transfer or payout. P0-24 owns payout onboarding, ledgering, transfer creation, settlement schedules, reconciliation, and payout failures.
- `refund_partial` — refund a bounded portion of the remaining buyer payment through the configured provider.
- `refund_full` — refund the complete remaining buyer payment through the configured provider.
- `cancel_after_payment` — cancel a paid order and refund its complete remaining buyer payment.
- `compliance_hold` — prevent seller settlement while a compliance review is active. Applying a hold to a release-authorised payment returns the order to `paid` and changes the payment intent to `compliance_hold`.
- `chargeback` — provider-originated only. A signed Stripe `charge.dispute.created` event records the chargeback and moves the order/payment to `disputed`.

## Separation of duties

Operations users require explicit RBAC permissions:

- `payments.read`
- `payments.request`
- `payments.approve`

A request stores the requesting user. The same user cannot approve their own request. Approval therefore requires a second currently authorised operations user. The database also enforces `approved_by <> requested_by` whenever both actors are present.

Provider-originated chargebacks use `source=provider` and have no operations requester or approver. They are authorised by the existing raw-body Stripe webhook signature/timestamp/live-mode checks instead.

## Refund execution

Refund requests are serialized per payment intent so only one refund/cancellation operation can be active at a time. The service recomputes the already-successful refunded amount while holding the payment rows and rejects any request that exceeds the remaining amount.

On approval:

1. Suqnaa locks the operation, payment intent, and order.
2. The remaining refundable amount is recomputed.
3. The operation moves to `processing` and records the independent approver.
4. Stripe receives a server-side refund request using the provider PaymentIntent reference, an order-derived AUD amount, and `suqnaa-payment-operation-v1-<operation UUID>` as the provider idempotency key.
5. Provider amount, currency, and PaymentIntent reference must match the persisted operation before any local state transition is applied.
6. `succeeded` finalises the refund immediately. `pending` and `requires_action` remain `processing`; signed `refund.created`, `refund.updated`, or `refund.failed` events reconcile the durable operation later.
7. `failed` or `canceled` provider refunds move the operation to `failed` without changing the order/payment state.

A partial refund preserves the residual payment state. For example, a partial refund while `compliance_hold` remains on compliance hold; a partial refund after release authorisation remains release-authorised. When cumulative successful refunds reach the original payment amount, the payment and order become `refunded`.

A successful `cancel_after_payment` always produces `payment_intents.status=refunded` and `transactions.status=cancelled`.

## Release semantics

`payment_intents.status=released` and `transactions.status=released` mean that the payment has passed the P0-23 authorisation gate and is eligible for seller settlement. They do not prove that a transfer or payout has occurred.

P0-24 must create separate settlement records and provider transfer/payout references before representing money as paid to a seller. It must also account for refunds or disputes that occur after transfer by using the appropriate transfer-reversal/reconciliation flow.

## Stripe signed events

The existing `/v1/payments/stripe-events` endpoint accepts only the supported signed event schemas:

- `payment_intent.succeeded`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.dispute.created`

The endpoint verifies the raw request body against `Stripe-Signature`, enforces the timestamp tolerance and test/live-mode match, and rejects unsupported/malformed event payloads.

Refund events must carry the internal `suqnaa_payment_operation_id` metadata added when the refund is created. Chargeback events are resolved from the Stripe Charge reference stored with the buyer receipt; clients cannot supply or override that mapping.

## Audit and replay controls

Every operations request and decision writes an audit record. Chargebacks write a provider-originated audit record. The `payment_operations` table stores durable idempotency keys and provider references. Chargeback event IDs are converted into unique operation idempotency keys, making exact event replays harmless while conflicting replays fail closed.

## Deliberate boundary

P0-23 does not create connected accounts, seller payout accounts, application fees, transfers, transfer reversals, payout schedules, or settlement ledger entries. Those remain P0-24 work.

For the current separate-charges-and-transfers design, provider refunds do not automatically reverse later seller transfers. P0-24 must explicitly reconcile or reverse transfers when a refund/dispute occurs after settlement.
