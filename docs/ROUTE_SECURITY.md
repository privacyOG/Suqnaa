# Route security

Sensitive routes should derive the acting user from the access token, not from client-submitted user identifiers.

Completed:

- Listing creation requires authentication and uses the authenticated user as the seller.
- Current account lookup requires authentication.

Next route hardening targets:

- Auction creation should use the authenticated user as seller.
- Bid creation should use the authenticated user as bidder.
- Checkout should use the authenticated user as buyer.
- Dispute creation should use the authenticated user as opener.
- Verification start/history should use the authenticated user.

Public read routes can remain public.
