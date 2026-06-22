# Current status

## Implemented

- API authentication with password hashing, short-lived access tokens, refresh-session rotation, logout revocation, and account lookup.
- Human-protection policy, provider-neutral challenge verification, Cloudflare Turnstile configuration, and security audit logging.
- Bounded in-memory rate limiting for authentication, listings, messages, conversations, and market actions.
- Authenticated listing creation, seller-owned listing management, conversations, messages, persisted buyer offers, orders, reviews, identity checks, and timed-sale actions.
- Same-origin web session cookies with automatic refresh rotation and one-retry authenticated proxy transport.
- Live bilingual web registration, login, account, public marketplace, listing detail, Sell, My Listings, conversation inbox, message-history, Message seller, and Make offer interfaces.
- Mobile authentication, account, listing, and conversation foundations with CI coverage.
- PostgreSQL/PostGIS schema, seeded marketplace categories, local Docker infrastructure, and CI workflows.

## Current protected web journey

1. A visitor browses active listings and opens a public item page without authentication.
2. A user signs in through the bilingual account flow.
3. Access and refresh credentials move into HttpOnly cookies.
4. Buyers can start the listing conversation or submit one idempotent pending offer.
5. The Sell page creates a protected listing draft without exposing bearer tokens.
6. My Listings loads only that seller's records and supports the API's allowed state transitions.
7. Messages lists only conversations where the account is a participant.
8. Conversation threads load protected history, acknowledge reads, and send idempotent challenge-bound messages.
9. Expired access sessions rotate automatically and retry the protected request once.

## Next implementation targets

- Seller offer review, accept, reject, and cancellation views.
- Protected order creation from accepted offers.
- Listing image upload, signed public image delivery, and full search filters.
- Shared production rate-limit storage for multi-instance deployments.
- Real protected-checkout and optional digital-currency provider selection with compliance review.
- Real assistant provider configuration and safety review.
- Generate native Android and iOS projects and complete release-signing pipelines.
- Final production logo and app-icon exports.
