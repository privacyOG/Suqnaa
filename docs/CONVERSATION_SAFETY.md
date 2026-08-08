# Conversation safety and moderation

P0-18 adds durable safety controls around the existing buyer/seller conversation model without weakening participant-only history access or exposing a generic staff message browser.

## Block and mute semantics

A user block is account-wide for messaging. The relationship is stored in `user_blocks` as a directed blocker/blocked pair, but **either direction blocks new messages in both directions**. Customer APIs intentionally expose only:

- whether the current user created the block (`blockedByMe`), and
- whether messaging is currently available (`messagingAvailable`).

They do not reveal whether the counterpart created a block.

Blocking a user also mutes every existing conversation with that user for the blocker. Unblocking restores message eligibility when no opposite-direction block remains, but it does not silently remove the blocker's mute preferences.

A mute is conversation-local and personal. It does not prevent either participant from sending or reading messages. P0-19 notification delivery must respect the persisted mute state when message notifications are added.

Existing conversation history remains participant-readable while a block is active.

## Database boundary

`023_conversation_safety.sql` adds:

- `user_blocks`
- `conversation_mutes`
- `messages.content_fingerprint`
- message-linked `reports.conversation_id` and `reports.message_id`
- lookup indexes for block, mute, fingerprint, and message-report workloads.

The `messages_participant_block_guard` trigger checks every inserted message and any update that changes sender/conversation identity. It rejects:

- a sender who is not a conversation participant, and
- a message written while either participant has blocked the other.

This is intentionally below the HTTP route so an alternate write path cannot bypass the relationship boundary.

The `reports_message_context_guard` trigger independently verifies a message report's participant, conversation, message sender, and reported account relationship.

## Message content and attachment policy

Message bodies remain bounded to 2,000 characters. Before persistence the API:

- trims the body,
- rejects unsupported control characters,
- permits at most three HTTP/HTTPS links,
- normalizes the body for spam comparison,
- stores a SHA-256 content fingerprint rather than a second plaintext copy.

### Attachments

Message attachments are **disabled** in P0-18. The message API accepts only an absent or empty `attachments` array and returns an empty attachment list.

This is deliberate. P1-04 is responsible for the hardened media pipeline needed before untrusted message files can be accepted, including metadata stripping, decompression protection, malware scanning, content-review hooks, lifecycle rules, and orphan cleanup. P0-18 does not create a parallel unsafe upload path.

Web and mobile surfaces show the disabled attachment policy rather than presenting a non-functional upload control.

## Durable spam controls

The existing short-window in-memory account/IP/pair limits remain as fast burst protection. P0-18 adds persisted message-history checks under PostgreSQL advisory locks so concurrent API requests cannot trivially race around them.

Current durable thresholds are:

- no more than three previous identical normalized messages to the same participant pair in ten minutes before the next repeat is rejected,
- an identical normalized message cannot be expanded to a new recipient after it has already been sent to three distinct recipients in thirty minutes,
- a sender cannot start messaging a thirteenth distinct counterpart inside one hour.

A sender-level advisory lock serializes these history checks. A participant-pair advisory lock serializes block changes with sends. Spam rejection returns `429` with a bounded retry interval; block rejection returns a generic messaging-unavailable conflict without identifying which participant created a block.

P1-03 still owns migration of fast in-memory rate-limit counters to shared Redis-backed storage for multi-instance deployment. The durable database spam rules in this batch are separate from those fast counters.

## Message reporting

`POST /v1/reports` now accepts a `messageId` report target. For message reports the client sends only:

- the message UUID,
- a supported reason,
- optional bounded details.

The API derives the conversation and reported account from the persisted message. It rejects:

- non-participants,
- reporting one's own message,
- client-supplied mixed listing/user/message target context,
- closed/unavailable target accounts.

One unresolved report per reporter/message is retained as the duplicate boundary. Reporting does not automatically block, suspend, or remove content; moderation remains a separately authorised decision.

## Moderation visibility

Message reports enter the existing reports queue. Queue summaries include a bounded reported-message preview and message status.

Authorised reviewers with `moderation.queue.read` may call the exact queue-item route:

`GET /v1/operations/queue/{reportId}/conversation-context`

The endpoint is available only for a message-linked report. It returns a target-centred window of up to twenty earlier/target messages and twenty later messages, plus:

- participant account status,
- listing context when present,
- current bilateral block state,
- each participant's mute state for that conversation,
- the exact reported message.

The moderation context intentionally includes retained messages whose customer status is `removed`, so deleting a message from the normal participant surface cannot erase moderation evidence. Reading this context is security-audited.

There is no operation to browse arbitrary conversations by account or conversation UUID.

## Web and mobile

The web conversation thread provides:

- mute/unmute,
- block/unblock with explicit confirmation,
- history-preserving messaging-unavailable state,
- message reporting with the dedicated report human-check action,
- an attachment-policy notice.

The web inbox shows mute and messaging-unavailable state. The operations queue can open the bounded report-linked moderation context.

The mobile conversation screen and transport provide the same persisted mute/block semantics, message-report target contract, disabled attachment contract, and history-preserving blocked state. The mobile inbox shows muted or messaging-unavailable state.

## Deferred adjacent work

P0-18 does not implement:

- cross-channel notification delivery; P0-19 owns durable notification delivery and must honor conversation mutes,
- realtime message transport/read reconciliation; P0-20 owns realtime or bounded polling,
- untrusted message attachments; P1-04 owns the hardened media pipeline,
- shared multi-instance burst counters; P1-03 owns shared rate-limit storage,
- automatic account punishment from spam or reports; later fraud/moderation policy items own those decisions.
