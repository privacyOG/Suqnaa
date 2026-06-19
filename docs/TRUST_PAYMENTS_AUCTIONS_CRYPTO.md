# Trust, payments, auctions, and cryptocurrency

Suqnaa must be built as a trust-first marketplace. Auctions, protected payments, cryptocurrency, buyer protection, seller protection, identity verification, and dispute resolution must be designed together rather than added as disconnected features.

## Core trust model

Suqnaa should use a layered trust model:

1. Account verification.
2. Seller verification.
3. Listing risk scoring.
4. Secure checkout and protected funds handling.
5. Delivery and fulfilment tracking.
6. Buyer confirmation or automated release rules.
7. Dispute resolution and evidence handling.
8. Seller protection against false claims and chargeback abuse.
9. Audit logs and compliance review.

## Protected payment model

The preferred marketplace flow is:

1. Buyer commits to purchase or wins an auction.
2. Buyer pays through a supported payment rail.
3. Funds move into a protected holding state.
4. Seller is notified to fulfil.
5. Buyer confirms receipt or fulfilment evidence is accepted.
6. Funds are released to the seller.
7. If there is a problem, the transaction enters dispute review.

Suqnaa should not release funds directly to a seller before the transaction reaches the configured release condition.

## Buyer protection

Buyer protection should cover:

- Item not received.
- Item materially not as described.
- Counterfeit or prohibited listing.
- Seller non-response after payment.
- Delivery dispute with trackable evidence.

Buyer protection should require evidence, deadlines, and clear policy wording.

## Seller protection

Seller protection should cover:

- Buyer falsely claiming non-receipt where tracking shows delivery.
- Buyer attempting to reverse payment after confirmed fulfilment.
- Buyer damaging or replacing an item then opening a dispute.
- Abuse of return/dispute rules.
- Non-payment after winning an auction.

Seller protection should require delivery proof, listing evidence, photos, serial numbers where relevant, and communication records.

## Auction model

Auctions require stricter controls than normal listings:

- Verified seller requirement for higher-value auctions.
- Optional bidder verification.
- Bid increments.
- Reserve price support.
- Anti-sniping extension windows.
- Bid retraction controls.
- Non-paying winner policy.
- Auction event audit log.
- Automatic conversion of the winning bid into a checkout or payment hold.

## Cryptocurrency support

Cryptocurrency support should be optional, disabled by default, and jurisdiction-gated. Monero can be modelled as a preferred crypto rail, but it must be integrated with strong compliance, risk review, and policy controls.

Important design rule: the marketplace should track order state, payment state, dispute state, and release state internally. Cryptocurrency transaction references should support fulfilment accounting, but Suqnaa should not assume that a blockchain payment alone means fulfilment is complete.

## Monero-specific design notes

- Use XMR as the currency code.
- Prefer unique payment requests per transaction.
- Record payment request metadata, expected amount, expiry, confirmation count target, and settlement status.
- Keep operational wallet secrets outside source control.
- Use view-only monitoring where possible.
- Do not hard-code wallet RPC credentials in the app or repository.
- Do not expose raw wallet infrastructure to client apps.

## Compliance gate

Before real money or cryptocurrency is enabled, Suqnaa needs a compliance review covering:

- Marketplace escrow or protected payment licensing.
- Payment provider terms.
- Digital currency provider obligations.
- AML/CTF controls.
- Sanctions screening.
- KYC thresholds.
- Refund handling.
- Dispute policy and consumer law obligations.
- Jurisdiction-specific availability.

Until that review is complete, payment and crypto features should stay in disabled or sandbox mode.
