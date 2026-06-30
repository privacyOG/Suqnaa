# Queue completion flow

This document describes the internal queue completion and review-support path.

## Access

The API requires a signed-in account and checks the account ID against the server-side `OPERATIONS_USER_IDS` allowlist.

## List queue items

```text
GET /v1/operations/queue?status=open&limit=25
```

Supported status filters:

- `open`
- `closed`
- `all`

The web operations page includes both an action panel and a read-only queue browser. The browser supports open, closed, and all views, paginated loading, linked listing/account context, reporter context, and stored close details when present.

## Complete a queue item

```text
POST /v1/operations/queue/{itemId}/complete
```

Request body:

```json
{
  "result": "no_change",
  "note": "Optional internal note"
}
```

Supported result values:

- `no_change`
- `changed_listing`
- `changed_account`
- `other`

Completing an item records the reviewer, result, optional note, and resolved timestamp. It does not directly change listings or accounts.

## Change linked listing or account status

```text
POST /v1/operations/queue/{itemId}/listing-status
POST /v1/operations/queue/{itemId}/account-status
```

The listing-status path updates the linked listing and closes the queue item in one server transaction. Supported listing status values are:

- `draft`
- `active`
- `reserved`
- `sold`
- `expired`
- `removed`

The account-status path updates the linked account and closes the queue item in one server transaction. Supported account status values are:

- `active`
- `suspended`

Both paths accept an optional internal note and write a durable internal record row for later review.

## View stored records

```text
GET /v1/operations/records?limit=25
```

Supported filters:

- `before`
- `action`
- `entityType`

The web operations page includes a read-only records panel with action/entity filters, paginated loading, duplicate-page protection, and compact metadata formatting.

## Remaining follow-up work

- Add full API route-level tests for the queue and records endpoints once a lightweight route test harness is available.
- Add operational alerting and retention guidance for stored internal records.
- Add production runbook steps for configuring `OPERATIONS_USER_IDS` and reviewing access periodically.
