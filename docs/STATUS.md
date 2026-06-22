# Current status

## Implemented

- API authentication with password hashing, short-lived access tokens, refresh-session rotation, logout revocation, and account lookup.
- Human-protection policy, provider-neutral challenge verification, Cloudflare Turnstile configuration, and security audit logging.
- Bounded in-memory rate limiting for authentication, listings, messages, conversations, and market actions.
- Authenticated listing creation, seller-owned listing management, conversations, messages, offers, orders, reviews, identity checks, and timed-sale actions.
- Same-origin web session cookies with automatic refresh rotation and one-retry authenticated proxy transport.
- Live bilingual web registration, login, account, Sell, My Listings, conversation inbox, and message-history interfaces.
- Mobile authentication, account, listing, and conversation foundations with CI coverage.
- PostgreSQL/PostGIS schema, seeded marketplace categories, local Docker infrastructure, and CI workflows.

## Current protected web journey

1. A user signs in through the bilingual account flow.
2. Access and refresh credentials move into HttpOnly cookies.
3. The Sell page creates a protected listing draft without exposing bearer tokens.
4. My Listings loads only that seller's records and supports the API's allowed state transitions.
5. Messages lists only conversations where the account is a participant.
6. Conversation threads load protected history, acknowledge reads, and send idempotent challenge-bound messages.
7. Expired access sessions rotate automatically and retry the protected request once.

## Next implementation targets

- Listing-detail actions for starting conversations and submitting offers.
- Seller offer and order management views.
- Listing image upload and full search filters.
- Shared production rate-limit storage for multi-instance deployments.
- Real protected-checkout and optional digital-currency provider selection with compliance review.
- Real assistant provider configuration and safety review.
- Generate native Android and iOS projects and complete release-signing pipelines.
- Final production logo and app-icon exports.
