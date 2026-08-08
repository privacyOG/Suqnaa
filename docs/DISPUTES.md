# Marketplace dispute workflow

P0-26 implements Suqnaa's generic buyer/seller dispute case system. It provides the durable case lifecycle used to collect participant statements and evidence, enforce response/review deadlines, support operations review, record resolutions, and allow one bounded appeal.

This system is deliberately separate from provider chargebacks and from final buyer/seller protection policy. Provider-originated card disputes remain signed payment-provider events handled by the payment state-transition system. P0-27 defines the final return, non-delivery, item-not-as-described, cancellation, refund, seller-protection, and buyer-protection policy workflows that use this case foundation.

## Case lifecycle

Only the buyer or seller on a paid, released, or already-disputed order can open a marketplace dispute. A payment can have only one active marketplace dispute at a time. The opener selects a bounded category and supplies a substantive reason.

The initial respondent has five days to respond. An operations reviewer can start review immediately or request additional information from either participant, which starts a new bounded response window. Operations review has a ten-day target deadline. The dispute deadline worker advances overdue response cases into operations review and records an escalation event.

Resolved cases receive a seven-day appeal window. Each dispute permits one participant appeal. An appeal reopens the case for review, and the participant who opened that appeal cannot decide it. Operations may uphold, reject, change, or escalate the appeal.

## Money movement remains separately authorised

A dispute reviewer cannot directly move buyer or seller funds.

When a resolution requires a full refund, partial refund, seller release, or compliance hold, P0-26 creates a request in the existing P0-23 payment-operation system. The request remains in `requested` state until a separately authorised payment approver acts on it. The payment-operation separation-of-duties rules remain unchanged.

A `return_required` dispute outcome records the case decision but deliberately does not create a payment operation. P0-27 will define the return completion and protection-policy consequences.

Marketplace disputes do not replace provider chargebacks. Chargebacks received from the payment provider continue to be handled by signed provider events.

## Seller settlement protection

An active marketplace dispute blocks seller settlement for the associated order. Database triggers enforce this boundary even if application code attempts to schedule or process the settlement. Opening or reopening an active dispute moves an existing scheduled/failed settlement to `blocked`, and insert/update attempts to `scheduled` or `processing` are forced back to `blocked` while the dispute is active.

After a dispute is no longer active, the existing seller-settlement worker may reschedule eligible blocked settlements according to the normal P0-24 payout-account and release rules. A case resolution itself does not create a seller transfer.

## Evidence privacy

Text evidence is stored in the protected dispute record. Binary evidence supports JPEG, PNG, WebP, and PDF files up to 10 MiB, with at most 12 active evidence items per dispute.

Binary evidence uses a private `dispute-evidence/<dispute-id>/...` namespace and stores a SHA-256 digest. It is never exposed through the public listing-media path. In production, evidence storage requires private S3-compatible object storage and download access is provided through short-lived signed URLs after participant or `disputes.read` authorization. Local storage exists only for development/testing.

Audit and dispute-event metadata record identifiers and evidence type/transport, not the private evidence body or full file contents.

## Authorization

Participant endpoints require an authenticated buyer/seller who belongs to the order. Operations endpoints use least-privilege RBAC:

- `disputes.read` — view protected cases and evidence.
- `disputes.review` — start review, request more information, and reconcile deadlines.
- `disputes.resolve` — record case resolutions and appeal decisions.

Monetary dispute resolutions additionally require `payments.request`. They still do not grant `payments.approve` or bypass the separate payment approval step.

The central operations-route permission mapper fails closed for any operations URL that is not explicitly mapped.

## Notifications and deadlines

P0-26 reuses the durable notification system introduced earlier. Existing dispute notification triggers enqueue participant notifications whenever dispute status/outcome changes. The deadline worker only performs transactional deadline reconciliation; it does not implement a parallel notification channel.

Worker defaults:

- `DISPUTE_DEADLINE_WORKER_INTERVAL_MS=60000`
- `DISPUTE_DEADLINE_WORKER_BATCH_SIZE=100`

Run with `pnpm --filter suqnaa-api worker:disputes` in environments where the worker process is deployed.

## User interfaces

Web order details include dispute opening, responses, text and binary evidence, private evidence downloads, resolution/payment-operation visibility, and appeals in English and Arabic.

Mobile provides native dispute listing/opening, responses, text evidence, private image evidence upload, resolution/payment-operation status, and appeals. Private PDF evidence remains accepted by the API and web interface; native mobile image evidence uses the existing image picker.

Operations web provides a dedicated protected dispute-review page for case triage, information requests, resolution recording, deadline reconciliation, and appeal decisions. P0-28 will later consolidate this surface into the complete administration dashboard.
