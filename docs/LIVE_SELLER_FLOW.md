# Live seller web flow

The web seller journey now uses the protected same-origin transport introduced for authenticated marketplace requests.

## Create listing

- `/{locale}/sell` requires an active account session.
- Expired access cookies are restored through the existing HttpOnly refresh-cookie flow.
- Listing drafts include title, description, price, currency, condition, country, optional location, pickup, and delivery settings.
- The browser never receives or submits a bearer token.
- When the configured human-challenge provider is enabled, the listing action uses the server-published `listingCreate` action identifier.
- Successful submissions are stored as `draft` and link directly to the seller dashboard.

## Manage listings

- `/{locale}/sell/manage` loads only the authenticated seller's listings.
- Listings can be filtered by status and paged using the API cursor.
- Available state changes match the API transition policy:
  - draft → active or removed
  - active → reserved, sold, or removed
  - reserved → active, sold, or removed
  - expired → active or removed
  - sold and removed are final
- Destructive and final changes require confirmation in the browser.
- When human challenge is enabled, every status mutation uses the `listingStatusUpdate` action and resets the challenge after submission.
- Rate limits, stale-state conflicts, expired sessions, and challenge failures have bilingual user-facing errors.

## Validation

The web regression command covers listing creation payloads, seller-list queries, status updates, challenge-header forwarding, same-origin credentials, and the absence of browser authorization headers.
