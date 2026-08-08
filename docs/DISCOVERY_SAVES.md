# Saved discovery and saved-search notifications

## Scope

P0-16 adds account-scoped discovery state for saved listings, a separate watchlist, recently viewed listings, normalized saved searches, and durable in-app notifications generated when a listing becomes a saved-search match.

This phase does not send email, SMS, or push notifications. Cross-channel event delivery remains separate notification-provider scope.

## Saved listings and watchlist

Saved listings and watchlist entries are independent durable relationships. A user may save a listing, watch it, do both, or do neither.

New save/watch relationships require the listing to be currently active and publicly eligible. If a previously saved or watched listing later becomes unavailable, its relationship remains removable but the API does not expose inactive listing details through the discovery list.

Default per-account limits are configurable:

- saved listings: 500
- watchlist: 200

## Recently viewed

Authenticated listing views are upserted per user/listing. The first-view timestamp is retained, the last-view timestamp advances, and a bounded view counter increments.

Only currently active public listings are returned from recent-history reads. The database keeps the newest 100 relationships per account by default; the bound is configurable.

## Saved searches

Saved searches store canonical normalized catalogue filters rather than raw URLs or cursor state. The same validation and normalization contract used by public catalogue search is reused for:

- search text
- category
- condition
- availability
- minimum and maximum price
- currency
- country
- region
- city
- suburb
- pickup/delivery mode

Sort order is presentation state and is not part of match significance. Saved-search fingerprints make semantically identical filter sets unique per account.

A saved search starts its notification cursor at creation time. Existing listings are therefore not retroactively delivered as a notification backlog. Re-enabling a paused search also resumes from the current time. Editing the filters resets its cursor and clears notifications associated with the previous filter definition.

## Notification matching

The discovery worker scans active saved searches under a PostgreSQL transaction advisory lock. Work is bounded and saved-search rows are selected with `FOR UPDATE SKIP LOCKED`.

For each search, eligible listings must:

- be active;
- belong to a seller whose account is not suspended or closed;
- not belong to the saved-search owner;
- match the normalized catalogue predicates; and
- have a listing `updated_at` after the saved search cursor and no later than the sweep cutoff.

The cursor is the ordered pair `(updated_at, listing_id)`. This prevents equal-timestamp records from being skipped when a batch boundary is reached.

Notifications are durable and unique per `(saved_search_id, listing_id)`. A later repeat sweep therefore cannot duplicate an already delivered listing for the same saved search. The listing edit version at match time is retained for traceability.

Notifications support unread filtering, idempotent single-read acknowledgement, and mark-all-read.

## Web and mobile

Web:

- signed-in listing detail records recent views and exposes separate Save and Watch controls;
- the catalogue can save the current normalized filter set directly;
- the protected Discovery Centre manages saved listings, watchlist, recent history, saved searches, and saved-search notifications.

Mobile:

- signed-in listing detail records recent views and exposes native save/watch actions;
- filtered catalogue state can be saved as a named search;
- the native Discovery Centre provides saved/watch/recent/search/notification management using authenticated refresh/retry transport.

## Operations

Run the worker under the deployment supervisor:

```sh
pnpm --filter suqnaa-api worker:discovery
```

Configuration:

- `DISCOVERY_NOTIFICATION_INTERVAL_SECONDS`
- `DISCOVERY_NOTIFICATION_SEARCH_BATCH_SIZE`
- `DISCOVERY_NOTIFICATION_MATCH_BATCH_SIZE`
- `RECENTLY_VIEWED_LIMIT`
- `SAVED_LISTING_LIMIT`
- `WATCHLIST_LIMIT`
- `SAVED_SEARCH_LIMIT`

The worker must run continuously in deployed environments for saved-search alerts to advance.
