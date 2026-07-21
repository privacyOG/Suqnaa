# Signed payment-provider events

## Scope

The payment-event endpoint is a provider-neutral ingestion boundary for verified server-to-server notifications. It is disabled by default and does not initiate checkout, collect funds, release funds, issue refunds, or resolve disputes.

The first accepted event type is:

- `payment.held`: confirms that the configured provider has verified the full stored order amount and is holding it under the provider reference supplied in the event.

A successfully applied event performs only these linked state changes:

- marketplace order: `pending` to `paid`
- payment intent: `created`, `awaiting_payment`, or `funds_received` to `held`

The payment-intent transition is produced by the existing database synchronization trigger after the order update. The event route does not directly update payment-intent status.

## Endpoint

`POST /v1/payments/provider-events`

The route is intentionally not authenticated with a user session and does not use a browser challenge. Authentication is provided by a configured provider identity, a bounded delivery timestamp, and an HMAC-SHA256 signature.

The route returns `503` while payment-event ingestion is disabled.

## Required headers

- `x-suqnaa-payment-provider`: the exact configured provider identifier.
- `x-suqnaa-payment-event-id`: a stable provider event identifier, 1 to 160 safe characters.
- `x-suqnaa-payment-event-timestamp`: Unix time in seconds for this delivery attempt.
- `x-suqnaa-payment-signature`: lowercase or uppercase hexadecimal HMAC-SHA256 signature.

The delivery timestamp must not be older than `PAYMENT_EVENT_MAX_AGE_SECONDS` and must not be more than 60 seconds in the future.

## Event body

```json
{
  "type": "payment.held",
  "paymentIntentId": "123e4567-e89b-42d3-a456-426614174000",
  "providerReference": "pay_12345",
  "amount": "125.50",
  "currencyCode": "AUD",
  "occurredAt": "2026-07-21T12:00:00.000Z"
}
```

The body is strict:

- no additional properties are accepted;
- amount must be a positive decimal string with exactly two fraction digits;
- currency must be a three-letter uppercase code;
- provider reference must contain 1 to 200 printable non-space characters;
- occurrence time must be an ISO timestamp with an explicit offset.

## Canonical signature input

The signature is calculated over these newline-separated values in this exact order:

1. `suqnaa-payment-event-v1`
2. provider identifier
3. provider event identifier
4. delivery Unix timestamp
5. event type
6. payment-intent UUID
7. provider reference
8. amount
9. currency code
10. event occurrence timestamp

The signing secret is never returned, logged, stored in the event ledger, or exposed to web or mobile clients. Signature comparison uses constant-time byte comparison.

## Replay and idempotency

Verified events are recorded in `payment_provider_events` with:

- provider and provider event identifier;
- payment-intent identifier;
- event type and provider reference;
- SHA-256 semantic payload fingerprint;
- occurrence, receipt, and processing timestamps;
- `processed` or `unchanged` result.

The provider/event identifier pair is unique.

A retry with the same event identifier and the same semantic payload returns an accepted duplicate response and performs no state change. Reusing the same event identifier with a different payload is rejected with `409`.

Concurrent identical deliveries are safe: conditional order updates and the unique event ledger ensure that only one transition is recorded as processed.

## Stored-context requirements

Before applying a new event, the API verifies:

- payment intent is linked to a marketplace order;
- buyer, seller, listing, rail, amount, and currency match the immutable stored order;
- event amount and currency match the stored payment intent;
- order status is `pending`;
- payment-intent status is `created`, `awaiting_payment`, or `funds_received`;
- provider evidence is either absent on both records or exactly matches the configured provider and event reference on both records.

Already-applied `paid` and `held` records are accepted only when both stored provider references match exactly.

Cancelled, released, refunded, disputed, compliance-held, or otherwise inconsistent records are rejected. A stale payment event cannot reopen a cancelled order or downgrade a later lifecycle state.

## Disabled operations

Every accepted response explicitly reports these capabilities as disabled:

- collection
- release
- refund
- dispute resolution

Future provider integrations must add separate signed event types and separate transition policies for any additional lifecycle state. No additional state may be inferred from `payment.held`.

## Deployment settings

- `PAYMENT_EVENT_PROVIDER`: safe lowercase provider identifier, or `none` to disable ingestion.
- `PAYMENT_EVENT_SIGNING_SECRET`: 32 to 512 character secret stored only in the deployment secret manager.
- `PAYMENT_EVENT_MAX_AGE_SECONDS`: accepted delivery age from 30 to 900 seconds; defaults to 300.

Setting a signing secret while the provider remains `none`, using an unsafe provider identifier, or using a short secret causes startup configuration validation to fail.

Provider selection, secret rotation, network restrictions, event retry behavior, settlement terms, and jurisdiction-specific compliance controls must be approved before enabling this endpoint in production.
