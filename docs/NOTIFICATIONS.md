# Durable marketplace notifications

P0-19 introduces a durable, provider-neutral notification pipeline for marketplace and account-security events.

## Delivery model

Every supported event creates the protected in-app notification row inside the same PostgreSQL transaction that commits the source marketplace/security mutation. Database triggers cover persisted messages, offer lifecycle changes, order lifecycle changes, payment-state transitions, fulfilment transitions, dispute changes, and security-sensitive audit events.

The same enqueue function also snapshots eligible outbound destinations into `notification_deliveries`. This is an outbox: provider delivery is never required for the source transaction to succeed and provider downtime cannot silently discard an event.

Each notification has a user-scoped `dedupe_key`. Replaying a source transition or enqueue attempt cannot create a duplicate in-app event or duplicate provider delivery for the same channel/destination.

## In-app API

Authenticated routes:

- `GET /v1/notifications` lists newest notifications, supports `unreadOnly`, bounded `limit`, and a `before` cursor, and returns the current unread count.
- `POST /v1/notifications/:notificationId/read` marks one owned notification read idempotently.
- `POST /v1/notifications/read-all` marks all owned notifications read.
- `GET /v1/notifications/preferences` returns channel preferences for messages, offers, orders, payments, fulfilment, disputes, and account security.
- `POST /v1/notifications/preferences` replaces one event-family preference.
- `POST /v1/notifications/push-targets` registers or refreshes an owned provider push destination.
- `DELETE /v1/notifications/push-targets/:targetId` revokes an owned push destination.

In-app delivery is mandatory and is not disabled by outbound preferences. A muted conversation therefore still produces the durable in-app `message.received` record so notification history remains coherent, but it does not enqueue email or push delivery for that message.

## Default outbound policy

Email and push are requested for unmuted messages, offers, orders, payments, and fulfilment events. Dispute and account-security events also request SMS. User preferences default to email enabled, push enabled, and SMS disabled; SMS therefore requires an explicit opt-in before any queued SMS delivery is created.

Outbound rows are only created when a usable destination exists. Email and SMS require a currently verified contact. Push requires an active registered push target. Conversation mutes take precedence over message email/push preferences.

## Provider contract

Email, SMS, and push providers are independently configured. The initial integration boundary is an approved HTTPS notification gateway rather than a vendor SDK embedded in the marketplace API.

The worker sends `POST` requests with bearer authentication, JSON content, and an `Idempotency-Key` header. The payload contains:

- `purpose: marketplace_notification`
- delivery and notification IDs
- channel and destination
- event type
- title and body
- metadata
- dedupe key

A JSON provider response may return `messageId` or `id`; that value is retained as `provider_message_id`. No provider-specific secret, response body, or destination is written to application logs by the worker.

## Worker reliability

Run the separately supervised process with:

```sh
pnpm --filter suqnaa-api worker:notifications
```

The worker claims bounded batches with `FOR UPDATE SKIP LOCKED`, moves rows to `processing`, increments the durable attempt counter, and releases the database transaction before making an external provider call.

Failed attempts use bounded exponential backoff. A stale `processing` lock is reclaimable after `NOTIFICATION_DELIVERY_LOCK_TIMEOUT_MS`, so process death does not strand a delivery forever. Rows become `dead` after `NOTIFICATION_DELIVERY_MAX_ATTEMPTS`; they remain in PostgreSQL for operations review rather than being deleted.

## Provider configuration

Each outbound channel uses:

- `NOTIFICATION_EMAIL_PROVIDER`, `NOTIFICATION_EMAIL_URL`, `NOTIFICATION_EMAIL_TOKEN`
- `NOTIFICATION_SMS_PROVIDER`, `NOTIFICATION_SMS_URL`, `NOTIFICATION_SMS_TOKEN`
- `NOTIFICATION_PUSH_PROVIDER`, `NOTIFICATION_PUSH_URL`, `NOTIFICATION_PUSH_TOKEN`

Provider mode is `disabled` or `http`. Disabled mode is safe for local environments and for production deployments before a provider has received marketplace/compliance approval. Production HTTP endpoints must use HTTPS.

Worker controls:

- `NOTIFICATION_PROVIDER_TIMEOUT_MS`
- `NOTIFICATION_WORKER_INTERVAL_MS`
- `NOTIFICATION_WORKER_BATCH_SIZE`
- `NOTIFICATION_DELIVERY_LOCK_TIMEOUT_MS`
- `NOTIFICATION_DELIVERY_MAX_ATTEMPTS`

## Privacy and security properties

- Notification APIs are account scoped through `requireUser`.
- Push targets cannot be silently transferred between accounts when a provider/destination pair already belongs to another user.
- Full email, phone, and push destinations are retained only where delivery requires them; they are never returned by the in-app notification API.
- Contact destinations are snapshotted only after contact verification.
- Conversation mutes suppress message email/push fan-out without deleting or hiding the recipient's in-app notification history.
- Outbound provider failures do not expose provider response bodies to users.
- Account-security notifications are derived from durable security audit records, keeping notification creation in the same database transaction as the audited action when that action writes its audit record transactionally.
- Dispute trigger coverage is present even while buyer/seller dispute submission remains quarantined; when the later dispute workflow writes the existing dispute tables, delivery semantics are already durable.

## Relationship to P0-20

P0-19 does not implement live conversation transport, message delivery receipts, or read-state reconciliation. Those remain P0-20. A `message.received` notification means the message was durably persisted and the notification was durably enqueued; it is not a claim that the recipient device rendered the conversation message.
