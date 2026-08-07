# Current status

## Implemented

- API authentication with password hashing, email-or-phone registration/sign-in, canonical E.164 phone identities, short-lived access tokens, refresh-session rotation, logout revocation, account lookup, enumeration-safe email/phone password recovery, one-time reset tokens, authenticated password changes, active-session listing, individual revocation, and revoke-all controls.
- Private-by-default editable marketplace profiles with display name, bio, city/country, descriptive business fields, field-level visibility controls, and a public profile API that never exposes account email or phone.
- Protected profile-avatar upload, owner delivery, public privacy-gated delivery, replacement, and deletion using signature-validated JPEG/PNG/WebP bodies capped at 2 MiB.
- Account JSON export plus password-confirmed account closure and personal-data deletion/anonymisation with session revocation, public-profile suppression, pending-activity cleanup, and retained marketplace/audit referential integrity.
- Email and phone contact verification with six-digit single-use codes, HMAC-only challenge storage, durable resend and issuance limits, five-attempt confirmation limits, provider-neutral delivery, audit records, account activation, and protected web/mobile flows.
- Seller identity/business verification with provider-neutral hosted-session creation/resume, dedicated signed replay-protected provider results, operations-only final approval/rejection, explicit expiry/reverification, business-subject change invalidation, audit records, and protected web/mobile seller status.
- Human-protection policy, provider-neutral challenge verification, configured challenge-provider support, and security audit logging.
- Bounded in-memory rate limiting for authentication, password recovery and session-security burst protection, account verification burst protection, seller verification and operations review, profile/export/closure operations, listings, listing media, messages, conversations, offers, market actions, fulfilment transitions, signed payment events, and protected activity reads.
- Authenticated listing creation, seller-owned listing and media management, conversations, messages, persisted buyer offers, atomic seller decisions, accepted-offer orders, reviews, reporting, and operations moderation actions.
- Same-origin web session cookies with automatic refresh rotation and one-retry authenticated proxy transport.
- Live bilingual web email/phone registration, login, password recovery/reset, password/session security, profile/privacy/business/avatar/export/account-lifecycle controls, contact verification, seller verification, operations verification review, account, public marketplace, listing detail, Sell, My Listings, seller photo galleries, marketplace activity, order history/detail, conversation inbox, message-history, Message seller, and Make offer interfaces.
- Public active-listing image delivery through API-owned URLs plus owner-only draft-image previews streamed through the authenticated same-origin web proxy.
- Dedicated challenge actions for password-reset requests, seller-verification starts, listing creation, listing status changes, media upload, and media deletion; verified mutations do not reuse unrelated challenge tokens.
- Complete bilingual catalogue filtering across API, web, and mobile: text, category, condition, availability, bounded price and currency, country, region, city, suburb, pickup/delivery mode, and newest or price sorting.
- Filter-bound opaque catalogue cursors with deterministic price/date/identifier ordering, legacy newest-cursor compatibility, strict mobile response parsing, and active-listing search indexes.
- Participant-only buyer and seller activity records with derived payment and fulfilment progress.
- Buyer-owned pending-order cancellation across API, web, and mobile with atomic order, offer, listing, and payment-context synchronization.
- One-to-one order, provider-neutral payment-intent, and fulfilment linkage with participant-only status reads and disabled collection/release capabilities.
- Disabled-by-default HMAC-authenticated payment-event ingestion with durable replay protection and a single controlled `payment.held` transition from pending/created states to paid/held.
- Paid-order fulfilment transitions plus bilingual web and mobile controls for seller readiness/shipping and buyer receipt confirmation, with held-payment/provider-evidence requirements and no automatic fund release.
- Mobile email/phone authentication, password recovery/reset, password/session security, native profile/business/privacy editing, password-confirmed account closure/deletion, secure profile handoff for avatar/export, account contact verification, native seller-verification status, bounded seller-verification initiation/handoff, listing, listing-photo galleries, conversation, order activity, checkout preparation, cancellation, and fulfilment controls with CI coverage.
- Mobile seller-photo previews through owner-only bearer-authenticated URLs, one-image native upload/deletion when challenge verification is disabled, and exact secure-web handoff when browser verification is required.
- PostgreSQL/PostGIS schema, seeded marketplace categories, manifest-ordered checksum migration ledger, verified legacy adoption, canonical E.164 phone constraint/migration, private-profile backfill and insert trigger, seller-verification event ledger, local Docker infrastructure, pre-review validation, and a required pull-request/main quality gate.

## Explicitly deferred

- Timed sales and bidding are not exposed through the API.
- Buyer and seller dispute submission is not exposed through the API.
- Descriptive business-profile fields alone do not indicate seller identity or business verification; only the reviewed verification lifecycle does.
- Reserved schema objects for still-deferred capabilities do not indicate product availability.
- Reintroduction requirements are defined in `DEFERRED_MARKETPLACE_FEATURES.md`.

## Current protected marketplace journey

1. A visitor browses active listings and opens a public item page without authentication.
2. Catalogue searches can combine text, category, condition, availability, price/currency, precise location, fulfilment, and deterministic sort controls on web or mobile.
3. Pagination uses a filter-bound opaque cursor so a cursor cannot be replayed with different filters or sort order; legacy timestamp cursors remain accepted only for newest-first results.
4. A user registers or signs in with email or an explicit international phone number. Phone input is canonicalized to E.164 before uniqueness checks, rate limiting, lookup, or persistence; local-only numbers are rejected rather than assigned an assumed country.
5. Every account receives a private marketplace profile row. Public profile data remains unavailable until the owner explicitly saves public visibility.
6. A newly registered account requests a code for its configured email or phone. Only a HMAC-bound code and contact fingerprint are persisted; codes expire after 10 minutes, are single-use, and are subject to durable issuance and attempt limits.
7. Successful contact confirmation records the channel verification time and activates a pending account. Web and mobile registration hand off directly to the protected verification flow.
8. Signed-in users can edit profile, business, location, and privacy fields. Public profile responses never contain email or phone and independently respect city, country, business-detail, and avatar visibility.
9. Sellers can open the protected seller-verification screen. The API derives individual-seller versus business level from the current profile, requires an explicit country code, and creates or resumes one serialized provider-hosted verification context.
10. Provider results are authenticated with a dedicated signed-event contract and durable replay ledger. Passed, failed, and manual-review results remain pending at marketplace level until an operations user makes the final audited decision.
11. Approved seller verification receives an explicit expiry date. Expiry or a material verified-business-name change requires reverification. Mobile uses the exact localized secure seller-verification page when browser human verification is enabled and never places credentials, account IDs, verification IDs, or provider data in the handoff URL.
12. Owners can maintain a signature-validated avatar, generate a JSON account export, or enter the password-confirmed closure/deletion workflow. Mobile uses the exact localized secure profile page for browser-specific avatar/export operations without embedding credentials or account data in the handoff URL.
13. Account closure hides the profile, removes eligible seller listings, cancels pending buyer offers, revokes refresh sessions, and invalidates outstanding recovery/verification challenges. Deletion additionally anonymises reusable contact/login/profile identity while retaining opaque marketplace records required for transaction and audit integrity.
14. If a user forgets a password, the public recovery endpoint accepts email or phone and gives the same accepted response regardless of account existence. Existing eligible accounts receive a 20-minute opaque reset token while PostgreSQL stores only its HMAC digest.
15. Consuming a valid reset token changes the password, invalidates every outstanding reset token, revokes all refresh sessions, and prevents token replay. Signed-in users can instead change their password after confirming the current password, with the same all-session revocation policy.
16. Signed-in users can review active refresh sessions, revoke one owned session, or revoke all sessions from web or mobile.
17. Access and refresh credentials move into protected session storage appropriate to the client.
18. Sellers create listing drafts through a challenge-bound form. In challenge-enabled deployments, images are added afterward so each upload receives its own media-specific verification.
19. Sellers preview draft and published galleries through owner-only URLs, add images up to the eight-photo limit, and delete individual images unless the listing is sold or removed.
20. Mobile sellers can preview those same owner-only galleries. Native upload and deletion run only when challenge verification is disabled; otherwise the app opens the exact localized secure photo manager without placing credentials, listing IDs, or challenge values in the URL.
21. Mobile binary uploads inherit access-token refresh and one-retry session behavior while preserving the original bytes and protected content type.
22. Buyers can start the listing conversation or submit one idempotent pending offer.
23. Sellers review incoming offers and atomically accept or reject them.
24. Accepting reserves the listing and rejects competing pending offers.
25. Buyers may cancel only pending offers or create one order from an accepted offer.
26. Order participants, amount, currency, payment method, and listing are derived from persisted records rather than client input.
27. Order creation atomically establishes one payment intent and one fulfilment record without collecting funds.
28. Buyers may irreversibly cancel eligible unpaid orders, which cancels the accepted offer, reactivates the listing, and synchronizes the payment context.
29. When an approved provider integration is configured, a signed and time-bounded `payment.held` event may atomically move only a matching pending order and eligible payment intent to paid/held.
30. Payment-event retries are accepted only when the provider event identifier and semantic payload match the durable replay ledger; conflicting replays are rejected.
31. Buyers and sellers can open participant-only order history, detail, and payment-context views with lifecycle progress.
32. Eligible sellers can mark readiness for pickup or submit bounded shipment evidence on web or mobile after verified held payment.
33. Eligible buyers can confirm receipt on web or mobile, with an explicit notice that confirmation does not release funds.
34. Mobile native fulfilment mutations run only when challenge verification is disabled; challenge-enabled environments open the exact secure web order for browser verification without placing mobile credentials in the URL.
35. My Listings loads only that seller's records and supports the API's allowed state transitions.
36. Messages lists only conversations where the account is a participant.
37. Conversation threads load protected history, acknowledge reads, and send idempotent challenge-bound messages.
38. Expired access sessions rotate automatically and retry the protected request once.

## Next implementation targets

- Replace the single environment administration allowlist with durable role-based least-privilege permissions and protected role changes.
- Add seller listing editing with optimistic concurrency across API, web, and mobile.
- Add listing expiry, renewal/reactivation, inventory lifecycle, and scheduled jobs.
- Real protected-checkout provider integration and payment collection that can produce the already-defined signed held-payment event.
- Separately authorized controlled release, refund, dispute, and compliance-hold event policies.
- Shared production rate-limit storage for multi-instance deployments.
- Optional digital-currency provider selection with compliance review.
- Generate native Android and iOS projects and complete release-signing pipelines.
- Final production logo and app-icon exports.
