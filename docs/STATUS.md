# Current status

## Implemented

- API authentication with password hashing, short-lived access tokens, refresh-session rotation, logout revocation, and account lookup.
- Human-protection policy, provider-neutral challenge verification, Cloudflare Turnstile configuration, and security audit logging.
- Bounded in-memory rate limiting for authentication, listings, listing media, messages, conversations, offers, market actions, fulfilment transitions, signed payment events, and protected activity reads.
- Authenticated listing creation, seller-owned listing and media management, conversations, messages, persisted buyer offers, atomic seller decisions, accepted-offer orders, reviews, identity checks, and timed-sale actions.
- Same-origin web session cookies with automatic refresh rotation and one-retry authenticated proxy transport.
- Live bilingual web registration, login, account, public marketplace, listing detail, Sell, My Listings, seller photo galleries, marketplace activity, order history/detail, conversation inbox, message-history, Message seller, and Make offer interfaces.
- Public active-listing image delivery through API-owned URLs plus owner-only draft-image previews streamed through the authenticated same-origin web proxy.
- Dedicated challenge actions for listing creation, listing status changes, media upload, and media deletion; verified media mutations are one-image operations and do not reuse listing-status tokens.
- Complete bilingual catalogue filtering across API, web, and mobile: text, category, condition, availability, bounded price and currency, country, region, city, suburb, pickup/delivery mode, and newest or price sorting.
- Filter-bound opaque catalogue cursors with deterministic price/date/identifier ordering, legacy newest-cursor compatibility, strict mobile response parsing, and active-listing search indexes.
- Participant-only buyer and seller activity records with derived payment and fulfilment progress.
- Buyer-owned pending-order cancellation across API, web, and mobile with atomic order, offer, listing, and payment-context synchronization.
- One-to-one order, provider-neutral payment-intent, and fulfilment linkage with participant-only status reads and disabled collection/release capabilities.
- Disabled-by-default HMAC-authenticated payment-event ingestion with durable replay protection and a single controlled `payment.held` transition from pending/created states to paid/held.
- Paid-order fulfilment transitions plus bilingual web and mobile controls for seller readiness/shipping and buyer receipt confirmation, with held-payment/provider-evidence requirements and no automatic fund release.
- Mobile authentication, account, listing, listing-photo galleries, conversation, order activity, checkout preparation, secure web handoff, cancellation, and fulfilment controls with CI coverage.
- Mobile seller-photo previews through owner-only bearer-authenticated URLs, one-image native upload/deletion when challenge verification is disabled, and exact secure-web handoff when browser verification is required.
- PostgreSQL/PostGIS schema, seeded marketplace categories, local Docker infrastructure, migration-executing preflight, and CI workflows.

## Current protected marketplace journey

1. A visitor browses active listings and opens a public item page without authentication.
2. Catalogue searches can combine text, category, condition, availability, price/currency, precise location, fulfilment, and deterministic sort controls on web or mobile.
3. Pagination uses a filter-bound opaque cursor so a cursor cannot be replayed with different filters or sort order; legacy timestamp cursors remain accepted only for newest-first results.
4. A user signs in through the bilingual account flow.
5. Access and refresh credentials move into protected session storage appropriate to the client.
6. Sellers create listing drafts through a challenge-bound form. In challenge-enabled deployments, images are added afterward so each upload receives its own media-specific verification.
7. Sellers preview draft and published galleries through owner-only URLs, add images up to the eight-photo limit, and delete individual images unless the listing is sold or removed.
8. Mobile sellers can preview those same owner-only galleries. Native upload and deletion run only when challenge verification is disabled; otherwise the app opens the exact localized secure photo manager without placing credentials, listing IDs, or challenge values in the URL.
9. Mobile binary uploads inherit access-token refresh and one-retry session behavior while preserving the original bytes and protected content type.
10. Buyers can start the listing conversation or submit one idempotent pending offer.
11. Sellers review incoming offers and atomically accept or reject them.
12. Accepting reserves the listing and rejects competing pending offers.
13. Buyers may cancel only pending offers or create one order from an accepted offer.
14. Order participants, amount, currency, payment method, and listing are derived from persisted records rather than client input.
15. Order creation atomically establishes one payment intent and one fulfilment record without collecting funds.
16. Buyers may irreversibly cancel eligible unpaid orders, which cancels the accepted offer, reactivates the listing, and synchronizes the payment context.
17. When an approved provider integration is configured, a signed and time-bounded `payment.held` event may atomically move only a matching pending order and eligible payment intent to paid/held.
18. Payment-event retries are accepted only when the provider event identifier and semantic payload match the durable replay ledger; conflicting replays are rejected.
19. Buyers and sellers can open participant-only order history, detail, and payment-context views with lifecycle progress.
20. Eligible sellers can mark readiness for pickup or submit bounded shipment evidence on web or mobile after verified held payment.
21. Eligible buyers can confirm receipt on web or mobile, with an explicit notice that confirmation does not release funds.
22. Mobile native fulfilment mutations run only when challenge verification is disabled; challenge-enabled environments open the exact secure web order for browser verification without placing mobile credentials in the URL.
23. My Listings loads only that seller's records and supports the API's allowed state transitions.
24. Messages lists only conversations where the account is a participant.
25. Conversation threads load protected history, acknowledge reads, and send idempotent challenge-bound messages.
26. Expired access sessions rotate automatically and retry the protected request once.

## Next implementation targets

- Real protected-checkout provider integration and payment collection that can produce the already-defined signed held-payment event.
- Separately authorized controlled release, refund, dispute, and compliance-hold event policies.
- Shared production rate-limit storage for multi-instance deployments.
- Optional digital-currency provider selection with compliance review.
- Marketplace support-provider configuration and safety review.
- Generate native Android and iOS projects and complete release-signing pipelines.
- Final production logo and app-icon exports.
