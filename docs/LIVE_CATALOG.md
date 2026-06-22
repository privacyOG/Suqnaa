# Live public catalog and buyer actions

The bilingual web marketplace now exposes active listings publicly while keeping all state-changing buyer actions behind the authenticated same-origin transport.

## Public catalog

- `/{locale}/listings` displays active listings with cursor-based pagination.
- `/{locale}/listings/{listingId}` displays one active listing with seller, category, fulfilment, trust, contact-verification, and verification-level metadata.
- Public reads are rate-limited by IP.
- Suspended or closed seller accounts are rejected by the single-listing endpoint.
- Internal object-storage keys are never returned. The API exposes only a media count until signed public media delivery is implemented.
- Inactive, sold, expired, removed, and draft listings return `404` from the public detail endpoint.

## Message seller

- Authenticated buyers can start or reuse the conversation bound to the listing.
- The seller identifier comes from the public listing response and the API independently verifies listing participation.
- Every message carries a client-generated UUID idempotency key.
- The message action uses the server-published `messageCreate` Turnstile action.
- Successful creation opens the correct protected conversation thread.

## Make offer

- Offers are persisted in the existing `offers` table and are tied directly to `listing_id`.
- Every submission carries a client-generated UUID idempotency key.
- The buyer cannot offer on their own listing.
- The listing must still be active.
- Offer currency must match the listing currency.
- The amount must be positive and cannot exceed the asking price.
- Only one pending offer is allowed per buyer and listing.
- Duplicate client IDs return the existing offer instead of creating another record.
- Account, IP, and buyer-listing velocity limits are enforced.
- The offer action uses the server-published `offerCreate` Turnstile action.
- Offer decisions and order creation remain separate later seller-management workflows.

## Database migration

`006_listing_offers.sql` adds client offer IDs, idempotency indexing, listing-status indexing, and one-pending-offer enforcement. Existing duplicate pending rows are normalized to `cancelled` before the unique partial index is created.
