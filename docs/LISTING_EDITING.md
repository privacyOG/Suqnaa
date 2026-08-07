# Seller listing editing

Seller listing edits use an explicit optimistic-concurrency version rather than `updated_at` timestamp equality. Browser and mobile date serialization can lose database timestamp precision, while a monotonic integer token is deterministic across clients.

## Editable states

Seller detail editing is available only while a listing is:

- `draft`
- `active`
- `expired`

`reserved`, `sold`, and `removed` listings cannot be edited through the seller detail endpoint. This prevents a seller from changing commercial or fulfilment terms after a listing has been reserved for a buyer or has reached a final state.

Status changes continue through the dedicated listing-status endpoint. Listing photos remain managed through the dedicated media workflow.

## Editable fields

The edit operation replaces the complete seller-editable snapshot:

- category
- title
- description
- price and currency
- condition
- availability status
- available quantity
- unit label
- country, region, city, and suburb
- pickup availability
- delivery/shipping availability

At least one fulfilment option must remain enabled. Category identifiers are validated against the category table. Client-supplied seller identifiers are not accepted; ownership comes from the authenticated account.

## Concurrency model

Migration `0021_listing_optimistic_concurrency` adds `listings.edit_version`, initially `1`, plus a PostgreSQL `BEFORE UPDATE` trigger that sets the next version to the previous version plus one.

The trigger applies to every listing update, not only the seller edit endpoint. Changes from listing-status operations, moderation, order workflows, or later lifecycle jobs therefore invalidate an older edit snapshot automatically.

A seller first reads:

`GET /v1/listings/:listingId/manage`

The response contains the owner-only listing snapshot, its current `version`, and whether its status is editable.

Saving uses:

`POST /v1/listings/:listingId/edit`

The request includes the complete editable field set and the version that was loaded with the form. The update statement is constrained by listing ID, authenticated seller ID, submitted version, and editable status. If another update wins first, the stale update changes zero rows and returns `409` with the current version and status. Clients do not automatically overwrite or merge the stale draft; the seller explicitly reloads the latest snapshot before saving again.

A true no-op edit does not perform a database update and therefore does not increment the version.

## Web behavior

The bilingual seller dashboard exposes **Edit details** for draft, active, and expired listings. The edit page loads an owner-only snapshot and shows its version and status. A `409` keeps the seller's stale form visible, explains that newer data exists, and provides an explicit **Reload latest version** action.

The authenticated same-origin proxy allowlist exposes only the exact owner-management and edit routes. It does not add a generic listing-management wildcard.

Listing edits use their own human-verification action, `listing.edit`, rather than reusing listing creation or status-change challenge tokens.

## Mobile behavior

The mobile My Listings screen links editable listings to the native edit screen. When browser human verification is disabled, the mobile app submits the complete edit snapshot natively with the loaded version and distinguishes a `409` conflict from ordinary request failures.

When browser human verification is enabled, the native fields are read-only and the app opens the exact localized secure web route:

`/{locale}/sell/manage/{listingId}/edit`

The handoff URL contains only the validated opaque listing UUID. It carries no access token, account identifier, edit version, challenge value, or listing form data.

## Deferred lifecycle work

This change does not implement automatic expiry, renewal/reactivation policy, inventory decrement/restoration, sold-out transitions, or scheduled listing lifecycle jobs. Those remain the next listing-lifecycle implementation batch.
