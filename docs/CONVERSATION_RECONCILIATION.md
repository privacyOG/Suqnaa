# Conversation polling and delivery reconciliation

P0-20 uses a bounded authenticated polling strategy rather than adding a persistent real-time transport dependency.

## State model

Messages continue to use the existing durable states:

- `queued`: the sender mutation committed successfully.
- `delivered`: the recipient has authenticated, polled the conversation, and the server reconciled the persisted message for that participant.
- `read`: the recipient explicitly acknowledged the open conversation through the existing read endpoint.
- `failed` and `removed`: retained existing terminal/moderation states.

A `delivered` state therefore means the recipient account reached the authenticated conversation sync boundary. It does not claim a push notification, operating-system notification, or screen rendering succeeded.

## Sync endpoint

`GET /v1/conversations/:conversationId/sync`

Query parameters:

- `limit`: 1–100, default 50.
- `cursor`: optional opaque cursor returned by the preceding sync response.

Only conversation participants can access the endpoint. Non-participants receive the same generic `404` conversation response used by the existing conversation APIs.

Before returning changes, the server atomically advances the caller's incoming `queued` or `sent` messages to `delivered`. The response then returns message rows ordered by `(updated_at, id)` so both content arrivals and later status changes are observable through one stream.

The cursor is versioned and encodes the last `(updated_at, message_id)` pair. Cursor ordering prevents messages that share a timestamp from being skipped. A malformed cursor is rejected rather than silently resetting the stream.

A response contains:

- `changes`: new messages or existing messages whose status/read timestamp changed since the cursor.
- `reconciliation.deliveredMessages`: count moved to `delivered` by this request.
- `pagination.cursor`: cursor for the next poll.
- `pagination.hasMore`: whether another immediate bounded page is available.
- `pagination.pollAfterMs`: `3000` normally, or `0` while a bounded backlog remains.

## Web behaviour

The signed-in web conversation thread starts polling after its normal initial history load and read acknowledgement.

Polling:

- runs only while the conversation URL remains active;
- pauses network work while the document is hidden;
- uses the server cursor and a normal 3-second interval;
- backs off to 5 seconds after request failure;
- reloads the active thread only when reconciliation reports a new/changed message state.

The reload strategy deliberately reuses the existing hardened history, safety, reporting, and acknowledgement paths instead of maintaining a second client-side message-state implementation.

## Mobile behaviour

The Flutter conversation screen starts a 3-second timer after the initial history load. It merges sync changes by durable message ID, updates existing rows for `delivered`/`read` transitions, and inserts new rows without duplication.

When the open mobile thread receives unread incoming changes, it invokes the existing acknowledgement endpoint. The sender can then observe that `read` transition on the next sync poll.

The timer is cancelled when the screen is disposed or its session changes. Poll failures are silent and retried on the next bounded interval rather than replacing the visible conversation with an error.

## Reliability properties

- The source message and all state transitions remain PostgreSQL-backed.
- Polling is authenticated and participant-scoped.
- Repeating a sync request is idempotent for already-delivered messages.
- Read acknowledgement remains a distinct mutation from delivery reconciliation.
- The server does not hold long-lived requests, sockets, or per-user in-memory delivery state.
- Multiple devices can poll safely because each transition is conditional on current durable status.
- P0-19 notifications remain separate: a marketplace notification is not used as evidence of message delivery or read state.
