# Buyer and seller protection workflows

P0-27 adds the executable marketplace protection policy that sits on top of the P0-25 fulfilment evidence, P0-26 dispute workflow, P0-23 payment-operation authorization, and P0-24 seller settlement system.

This policy is an application policy and operational control, not a representation that Suqnaa is an escrow service, custodian, payment provider, insurer, or merchant of record. Final production legal wording remains subject to P0-31 legal review.

## Separation of responsibilities

The systems intentionally remain separate:

- `disputes` are the review and decision record.
- `order_protection_cases` record which protection policy and eligibility facts were applied to a resolved dispute.
- `order_returns` track the physical return lifecycle after a `return_required` decision.
- `payment_operations` remain the only application path for requesting a refund, partial refund, post-payment cancellation, release, or compliance hold.
- `seller_settlements` remain the payout/settlement record and are blocked by active disputes and active returns.

A protection or return decision never directly edits a provider balance, payment intent, seller transfer, or payout amount.

## Policy version

The initial executable policy identifier is `au-marketplace-protection-v1`.

Eligibility is evaluated from persisted server-side order, payment, fulfilment, pickup, delivery, and return facts. The resulting facts and policy version are snapshotted into `order_protection_cases.eligibility_basis` so a later policy change does not silently rewrite the basis of an earlier decision.

## Buyer protection

### Non-delivery

A buyer remedy for a `non_delivery` dispute requires a shipping order that has actually been marked shipped and has not subsequently been marked delivered or buyer-confirmed.

When the selected shipping option has a maximum ETA, the claim becomes eligible after that maximum number of days has elapsed from the persisted shipped timestamp. When no ETA was provided, the initial policy uses a conservative 14-day fallback shipping window. The eligibility snapshot records whether that fallback was used.

Opening a dispute is not blocked before the window expires. This allows the buyer to report a problem and provide evidence immediately. Operations cannot grant a buyer refund/partial-refund/return remedy until the policy becomes eligible.

### Item not as described or damaged

`item_condition` and `damage` disputes map to the `item_not_as_described` protection class.

The initial policy requires a completed delivery/handoff signal and permits the buyer remedy for seven days after the first applicable completion record: buyer receipt confirmation, recorded delivery, or verified pickup proof.

### Post-payment cancellation

A `payment_issue` dispute can qualify for the post-payment cancellation policy when buyer payment has already been collected but physical fulfilment has not started. Shipment, delivered/received state, or verified pickup prevents the simple post-payment cancellation protection path; the order must then use the applicable fulfilment/dispute policy instead.

Pre-payment pending-order cancellation remains the existing P0 cancellation flow and does not require a protection case.

## Seller protection

A seller release remains a separately authorised payment-operation request. Resolving a buyer claim in the seller's favour records the seller as the protection beneficiary without bypassing payment approval.

An authorised return also protects the seller from immediate settlement/refund finalization while the physical return is outstanding. If the buyer does not ship within the return window, the return expires and operations may request seller release, subject to the same payment-operation separation of duties.

If the seller receives a return but contests its condition, the return remains blocked in `contested` state until operations resolves the protection outcome. The seller must provide a substantive contest note.

## Returns

A `return_required` dispute resolution creates one durable return linked to the dispute and protection case. The initial buyer shipment window is 14 days from authorization.

Return states are:

- `authorized` / `awaiting_shipment`
- `in_transit`
- `delivered`
- `received`
- `contested`
- `completed`
- `cancelled`
- `expired`

The buyer records carrier and tracking reference. Tracking URLs must use HTTPS. The seller records whether the returned item is accepted or contested. A contested condition requires an explanatory note.

Operations may complete a received/contested return by requesting either a full buyer refund or seller release. These actions call the existing P0-23 payment-operation service and remain in its normal requested/approved/processing/succeeded lifecycle. An expired unshipped return cannot be converted into a buyer refund by the return-resolution endpoint.

## Settlement safety

Database triggers prevent a seller settlement from entering `scheduled` or `processing` while either of these is active for the order:

- a marketplace dispute in `opened`, `awaiting_buyer`, `awaiting_seller`, or `under_review`; or
- a return in `authorized`, `awaiting_shipment`, `in_transit`, `delivered`, `received`, or `contested`.

Creating or reactivating an active return also moves an existing `scheduled` or `failed` seller settlement to `blocked`.

This is deliberately database-enforced so application bugs or concurrent workers cannot bypass the protection hold.

## Authorization

Participant return endpoints require the authenticated order participant and enforce role ownership in the service:

- only the buyer can record return shipment;
- only the seller can acknowledge/contest the returned item;
- only buyer or seller can read protection state for their order.

Operations return resolution uses `disputes.resolve`. Return deadline reconciliation uses `disputes.review`. Any resolution that requests buyer refund or seller release additionally requires `payments.request`. The resulting payment operation still requires a separate `payments.approve` actor before money-state transition.

## Deadline reconciliation

The return reconciliation service expires authorised/awaiting-shipment returns whose shipment deadline has elapsed. The operation is idempotent and uses row locking before state transition.

P0-27 will add the worker/UI integration around this service before completion. P0-28 will later consolidate operations controls into the full administration dashboard, and P0-31 will replace policy-facing legal copy with legally reviewed English and Arabic content.
