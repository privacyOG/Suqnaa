# Queue status notes

This note records the current internal queue/support state for staging planning.

## Current state

- Internal queue listing is available through the API and web operations page.
- Queue items can be viewed by open, closed, or all status.
- The queue browser supports paginated loading and duplicate-page protection.
- Queue cards show linked listing, linked account, reporter context, and stored close details when present.
- Queue completion stores reviewer result, optional note, and close timestamp.
- Linked listing/account status changes are handled through dedicated API paths and close the related queue item.
- Stored internal records can be viewed through a read-only panel with action/entity filters and paginated loading.
- Web client coverage exists for queue, records, and related action paths.
- API unit coverage exists for the durable record-writer mapping and failure propagation.

## Staging requirements

Before staging use, configure:

- `OPERATIONS_USER_IDS` with only trusted internal account IDs.
- Production-like API/web origins.
- Database migrations for report review metadata and internal record storage.
- A written process for who reviews reports and how decisions are checked.

## Remaining work

- Add route-level API tests once a lightweight Fastify/database test harness is available.
- Add production retention and export guidance for stored internal records.
- Add periodic access review guidance for the internal allowlist.
