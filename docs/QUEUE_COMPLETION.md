# Queue completion flow

This document describes the internal queue completion path.

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

## Follow-up work

- Add the full internal queue UI.
- Add separate, audited action endpoints for listing/account changes.
- Add durable audit-log review and alerting.
