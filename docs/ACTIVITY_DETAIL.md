# Activity detail views

This slice adds participant-only activity records without changing the database schema.

## API

- `GET /v1/market/orders` lists records where the authenticated account is the buyer or seller.
- `GET /v1/market/orders/:orderId` returns one record only to its buyer or seller.
- Non-participants receive the same `404` response as missing records.
- Pagination uses the existing `updated_at` cursor.
- Read limits apply by account and IP.

## Progress model

Progress is derived from the existing transaction lifecycle:

- `pending`: waiting for payment confirmation.
- `paid`: fulfilment or handover in progress.
- `released`: complete.
- `disputed`: resolution required.
- `refunded`: funds returned.
- `cancelled`: terminal cancellation.

The progress mapping is deterministic and covered by an API regression test.

## Web

- `/{locale}/activity/orders` shows bilingual buyer and seller history.
- `/{locale}/activity/orders/{orderId}` shows the participant-only detail view and progress steps.
- Browser requests continue through the same-origin authenticated proxy and do not expose bearer credentials.
