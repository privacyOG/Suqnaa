# Listing lifecycle and inventory

P0-15 makes listing availability a durable database lifecycle instead of a UI-only status convention.

## Active listing expiry

Active listings have an explicit `expires_at` value. The default active lifetime is 30 days and is configurable with `LISTING_ACTIVE_DAYS` from 1 to 365 days.

A dedicated lifecycle worker changes due `active` listings to `expired`, expires their still-pending offers, writes audit records, and relies on the existing listing `edit_version` trigger so any stale seller edit form conflicts after the lifecycle change.

Run the worker as a separate long-running process:

```bash
pnpm --filter suqnaa-api worker:listings
```

The worker interval defaults to 60 seconds and is controlled by `LISTING_LIFECYCLE_INTERVAL_SECONDS`. Each sweep uses a PostgreSQL advisory lock and `FOR UPDATE SKIP LOCKED` batching so multiple worker processes do not apply the same lifecycle transition concurrently.

Production container/process supervision is deliberately left to P1-01. Until then, any deployment intended to exercise automatic expiry must run the API and this worker as separate supervised processes against the same PostgreSQL database.

## Renewal and reactivation

An active listing may be renewed only during its configured renewal window. The default window is the final seven days before expiry and is controlled by `LISTING_RENEWAL_WINDOW_DAYS`.

An expired listing may be reactivated immediately when it still has publishable inventory.

Seller lifecycle state is available through:

- `GET /v1/listings/:listingId/lifecycle`
- `POST /v1/listings/:listingId/renew`

The mutation accepts only the listing version loaded by the seller. Ownership comes from the authenticated account. A stale version returns `409` rather than overwriting a newer edit, moderation change, inventory transition, or lifecycle event.

Web and mobile seller interfaces expose expiry, inventory, renewal availability, and the current state version. Renewal/reactivation is disabled when a finite listing has no inventory.

## Inventory semantics

Listings have one of two inventory models:

- `service_available`: quantity is unlimited for marketplace reservation purposes and remains `NULL`.
- finite goods: quantity is always a non-negative integer. Legacy or omitted finite quantities normalize to one unit.

Finite quantity and availability are kept consistent by a PostgreSQL constraint and lifecycle trigger:

- quantity `0` means `out_of_stock`;
- positive quantity uses `in_stock` or `limited`;
- a sold finite listing is forced to quantity `0` and `out_of_stock`.

This database boundary applies to API, maintenance, moderation, and future worker writes rather than trusting each caller to reproduce inventory rules.

## Accepted-offer reservations

When a pending offer becomes accepted, PostgreSQL creates one durable `listing_inventory_reservations` row.

For finite goods the reservation decrements one unit. When the final available unit is reserved, the listing becomes `out_of_stock` and remains unavailable to new offers. Service listings create a zero-quantity reservation and do not decrement inventory.

An accepted offer has a bounded pre-order reservation period, defaulting to 60 minutes through `LISTING_RESERVATION_MINUTES`. Creating an order atomically binds the reservation to that order and clears the reservation deadline. An order cannot bind a reservation whose deadline has already elapsed, even if the lifecycle worker has not yet swept it.

The current offer/order workflow remains serialized at listing level: accepting an offer reserves the listing and rejects competing pending offers. P0-15 therefore adds correct inventory accounting without introducing parallel checkout semantics that would alter the existing transaction model.

## Restoration and abandoned reservations

The currently supported unpaid pending-order cancellation changes the order to `cancelled`. A database trigger releases its inventory reservation and restores exactly the reserved finite quantity before the existing cancellation route reactivates the listing.

If the listing expiry elapsed while it was reserved, the lifecycle guard converts that reactivation to `expired` instead of silently returning an overdue listing to the public catalogue.

Accepted offers that never produce an order are released by the worker after the reservation deadline. The reservation is marked `released`, finite stock is restored, the accepted offer becomes `expired`, and an audit record is written.

Post-payment cancellation, refunds, partial refunds, chargebacks, release, and compliance holds remain P0-23 scope. P0-15 does not infer inventory restoration from payment states that do not yet have an approved marketplace policy.

## Configuration

- `LISTING_ACTIVE_DAYS`: active lifetime, default `30`, maximum `365`.
- `LISTING_RENEWAL_WINDOW_DAYS`: renewal window before expiry, default `7`, maximum `90`, and not greater than the active lifetime.
- `LISTING_RESERVATION_MINUTES`: accepted-offer reservation deadline before an order exists, default `60`, maximum `1440`.
- `LISTING_LIFECYCLE_BATCH_SIZE`: maximum due rows processed per sweep, default `100`, maximum `1000`.
- `LISTING_LIFECYCLE_INTERVAL_SECONDS`: delay between sweeps, default `60`, maximum `3600`.

All settings are deployment configuration. They do not carry credentials and are safe to document, but production values still belong in deployment configuration rather than source-code branching logic.
