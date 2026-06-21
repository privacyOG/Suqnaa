# Route security

Sensitive routes derive the acting user from the access token, not from client-submitted user identifiers.

Completed:

- Listing creation requires authentication and uses the authenticated user as the seller.
- Current account lookup requires authentication.
- Protected browser operations use `/api/authed/...`; browser code never reads or submits bearer tokens.
- The web proxy accepts only explicit route-and-method combinations for account lookup, conversations, messages, listings, timed sales, offers, orders, reviews, and identity checks.
- Unknown routes, unknown query keys, duplicate query keys, unsafe path segments, and unsupported methods are rejected before an upstream request is made.
- Protected browser requests must pass same-origin validation.
- POST bodies must be JSON objects and are limited to 64 KiB.
- The proxy constructs its own upstream headers. Client-supplied authorization and arbitrary forwarding headers are never passed through.
- Human-check responses are bounded and forwarded only through `x-suqnaa-human-check`.
- An upstream `401` triggers one server-side refresh-token rotation and one retry of the original request.
- If rotation succeeded but the upstream service is temporarily unavailable, replacement cookies are still issued so the browser does not retain the revoked refresh token.
- Final `401` responses clear the unusable web session.
- Only JSON content type and Retry-After are copied from upstream responses; all protected responses are marked `no-store`.

Next route hardening targets:

- Auction creation should use the authenticated user as seller.
- Bid creation should use the authenticated user as bidder.
- Checkout should use the authenticated user as buyer.
- Dispute creation should use the authenticated user as opener.
- Verification history should use the authenticated user.

Public read routes can remain public.
