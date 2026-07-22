# Live public catalogue and buyer actions

The bilingual web and mobile marketplace exposes active listings publicly while keeping state-changing buyer and seller actions behind authenticated protected transports.

## Public catalogue

- `/{locale}/listings` and the mobile home catalogue display active listings with filter-bound cursor pagination.
- `/v1/listings/search` supports bounded text search, category, condition, availability, minimum/maximum price with explicit currency, country, region, city, suburb, fulfilment, and deterministic sort controls.
- Fulfilment filtering supports pickup, delivery, or listings that offer both.
- Sort modes are newest first, price low to high, and price high to low. Price sorting is limited to one explicit currency.
- Opaque cursors bind the active filter set, sort mode, ordering value, timestamp, and listing identifier. Reusing a cursor with different filters is rejected.
- Legacy ISO timestamp cursors remain accepted only for newest-first pagination.
- Active-listing partial, full-text, filter, fulfilment, price, and trigram indexes support the public query shapes.
- Search summaries include the seller, category, cover media, media count, inventory status, precise location fields, and fulfilment options.
- `/{locale}/listings/{listingId}` displays one active listing with seller, category, fulfilment, trust, contact-verification, and verification-level metadata.
- Public reads are rate-limited by IP.
- Suspended or closed seller accounts are excluded from search and rejected by the single-listing endpoint.
- Internal object-storage keys are never returned. Public media is delivered through API-owned listing URLs.
- Inactive, sold, expired, removed, and draft listings return `404` from the public detail endpoint.

## Mobile catalogue integrity

- Mobile query options reject unsupported enum values, malformed category identifiers, oversized cursors or text, invalid price ranges, and price filters or sorting without a three-letter currency.
- Mobile catalogue responses reject duplicate listings, contradictory pagination, cross-listing media URLs, unsupported media types, malformed identifiers, and invalid category or seller metadata.
- Search, category changes, filter changes, and load-more pagination preserve the complete active filter and sort state.
- Duplicate listing identifiers are suppressed before results are appended to the visible catalogue.

## Message seller

- Authenticated buyers can start or reuse the conversation bound to the listing.
- The seller identifier comes from the public listing response and the API independently verifies listing participation.
- Every message carries a client-generated UUID idempotency key.
- The message action uses the server-published message-creation challenge action.
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
- The offer action uses the server-published offer-creation challenge action.
- Offer decisions and order creation remain separate seller-management workflows.
