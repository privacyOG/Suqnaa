# Fulfilment transitions

## Purpose

The fulfilment transition foundation records seller readiness or shipment and buyer receipt confirmation after a verified payment has entered protected holding.

It does not collect funds, mark an order paid, release funds, resolve disputes, or infer delivery from a participant statement.

## Required payment state

Every transition requires all of the following persisted conditions:

- the marketplace transaction status is `paid`;
- the linked payment-intent status is `held`;
- the payment intent stores both provider and provider-reference evidence; and
- the linked fulfilment record exists.

Until provider integration creates those conditions, the route remains dormant by design.

## Route

Authenticated participants use:

`POST /v1/market/orders/:orderId/fulfilment`

The request is challenge-bound, rate-limited by account and IP, revalidated inside a database transaction, and written with a conditional status predicate.

## Seller transitions

Only the order seller may perform seller actions.

### Ready for pickup

Request:

```json
{
  "action": "ready_for_pickup"
}
```

Allowed transition:

`not_started → ready_for_pickup`

A repeated identical transition is idempotent.

### Shipped

Request:

```json
{
  "action": "shipped",
  "carrier": "Carrier name",
  "trackingReference": "Tracking reference"
}
```

Allowed transition:

`not_started → shipped`

Carrier and tracking evidence are required and bounded. A repeated request is idempotent only when the stored carrier and tracking reference exactly match the request.

## Buyer confirmation

Only the order buyer may confirm receipt.

Request:

```json
{
  "action": "confirm_received"
}
```

Allowed transitions:

- `ready_for_pickup → received_confirmed`
- `shipped → received_confirmed`
- `delivered → received_confirmed`

A repeated confirmation is idempotent.

Buyer confirmation records `buyer_confirmed_at`, but the order remains `paid` and the payment intent remains `held`. Release requires a separate future operation with its own authorization, audit, dispute-window, provider, and compliance controls.

## Security actions

The public challenge configuration publishes:

- `fulfilmentManage` for seller readiness and shipping; and
- `fulfilmentConfirm` for buyer receipt confirmation.

A failed security challenge prevents the mutation and is recorded in the security audit stream.

## Database evidence guards

Migration `009_fulfilment_evidence_guards.sql` enforces new or updated records as follows:

- `shipped` requires a shipment timestamp, carrier, and tracking reference;
- `delivered` requires a delivery timestamp; and
- `received_confirmed` requires a buyer-confirmation timestamp.

The constraints are introduced as `NOT VALID` so existing legacy rows are not rewritten or falsely completed. PostgreSQL still enforces them for new and updated rows. Legacy rows can be separately reconciled and validated later.

## Explicitly disabled

This foundation does not provide routes for:

- payment collection or confirmation;
- seller self-reporting that payment was received;
- carrier delivery events;
- payment release;
- automatic release after buyer confirmation;
- refund or dispute resolution; or
- alteration of transaction or payment-intent status.
