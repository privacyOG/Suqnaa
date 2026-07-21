# Current status

## Implemented

- API authentication with password hashing, short-lived access tokens, refresh-session rotation, logout revocation, and account lookup.
- Human-protection policy, provider-neutral challenge verification, Cloudflare Turnstile configuration, and security audit logging.
- Bounded in-memory rate limiting for authentication, listings, messages, conversations, offers, market actions, fulfilment transitions, signed payment events, and protected activity reads.
- Authenticated listing creation, seller-owned listing management, conversations, messages, persisted buyer offers, atomic seller decisions, accepted-offer orders, reviews, identity checks, and timed-sale actions.
- Same-origin web session cookies with automatic refresh rotation and one-retry authenticated proxy transport.
- Live bilingual web registration, login, account, public marketplace, listing detail, Sell, My Listings, marketplace activity, order history/detail, conversation inbox, message-history, Message seller, and Make offer interfaces.
- Participant-only buyer and seller activity records with derived payment and fulfilment progress.
- Buyer-owned pending-order cancellation across API, web, and mobile with atomic order, offer, listing, and payment-context synchronization.
- One-to-one order, provider-neutral payment-intent, and fulfilment linkage with participant-only status reads and disabled collection/release capabilities.
- Disabled-by-default HMAC-authenticated payment-event ingestion with durable replay protection and a single controlled `payment.held` transition from pending/created states to paid/held.
- Paid-order fulfilment transitions plus bilingual web and mobile controls for seller readiness/shipping and buyer receipt confirmation, with held-payment/provider-evidence requirements and no automatic fund release.
- Mobile authentication, account, listing, conversation, order activity, checkout preparation, secure web handoff, cancellation, and fulfilment controls with CI coverage.
- PostgreSQL/PostGIS schema, seeded marketplace categories, local Docker infrastructure, migration-executing preflight, and CI workflows.

## Current protected marketplace journey

1. A visitor browses active listings and opens a public item page without authentication.
2. A user signs in through the bilingual account flow.
3. Access and refresh credentials move into protected session storage appropriate to the client.
4. Buyers can start the listing conversation or submit one idempotent pending offer.
5. Sellers review incoming offers and atomically accept or reject them.
6. Accepting reserves the listing and rejects competing pending offers.
7. Buyers may cancel only pending offers or create one order from an accepted offer.
8. Order participants, amount, currency, payment method, and listing are derived from persisted records rather than client input.
9. Order creation atomically establishes one payment intent and one fulfilment record without collecting funds.
10. Buyers may irreversibly cancel eligible unpaid orders, which cancels the accepted offer, reactivates the listing, and synchronizes the payment context.
11. When an approved provider integration is configured, a signed and time-bounded `payment.held` event may atomically move only a matching pending order and eligible payment intent to paid/held.
12. Payment-event retries are accepted only when the provider event identifier and semantic payload match the durable replay ledger; conflicting replays are rejected.
13. Buyers and sellers can open participant-only order history, detail, and payment-context views with lifecycle progress.
14. Eligible sellers can mark readiness for pickup or submit bounded shipment evidence on web or mobile after verified held payment.
15. Eligible buyers can confirm receipt on web or mobile, with an explicit notice that confirmation does not release funds.
16. Mobile native fulfilment mutations run only when challenge verification is disabled; challenge-enabled environments open the exact secure web order for browser verification without placing mobile credentials in the URL.
17. The Sell page creates a protected listing draft without exposing bearer tokens.
18. My Listings loads only that seller's records and supports the API's allowed state transitions.
19. Messages lists only conversations where the account is a participant.
20. Conversation threads load protected history, acknowledge reads, and send idempotent challenge-bound messages.
21. Expired access sessions rotate automatically and retry the protected request once.

## Next implementation targets

- Real protected-checkout provider integration and payment collection that can produce the already-defined signed held-payment event.
- Separately authorized controlled release, refund, dispute, and compliance-hold event policies.
- Listing image upload, signed public image delivery, and full search filters.
- Shared production rate-limit storage for multi-instance deployments.
- Optional digital-currency provider selection with compliance review.
- Real assistant provider configuration and safety review.
- Generate native Android and iOS projects and complete release-signing pipelines.
- Final production logo and app-icon exports.
