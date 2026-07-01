# Runtime checks

This document defines minimum runtime checks before Suqnaa is opened as a public marketplace.

## Required signals

Production must provide visibility into:

- API process availability.
- Web application availability.
- Database connectivity and query failures.
- Object storage read and write failures.
- Authentication failures and session errors.
- Listing creation, listing updates, media delivery, messages, offers, reports, and operations activity.
- HTTP 4xx and 5xx rates by route group.
- Latency for public listing browse, listing detail, login, media delivery, and protected account routes.

## Required alerts

Create alerts for:

- API health endpoint unavailable for more than five minutes.
- Web application unavailable for more than five minutes.
- Database connection failures.
- Object storage write or delivery failures.
- Sustained 5xx responses above normal baseline.
- Sudden spike in authentication failures.
- Queue or report-processing work not being handled within the expected window.

## Launch smoke checks

Run these checks after every production deployment:

1. Load the public home page.
2. Load the public listing browse page.
3. Load a listing detail page with media.
4. Create a test account in the production-equivalent environment.
5. Sign in and verify session persistence.
6. Create a draft listing.
7. Upload listing media.
8. Publish the listing.
9. Send a buyer message or offer in the production-equivalent environment.
10. Submit a report and verify it appears in the operations workflow.
11. Verify logs contain request IDs or enough correlation data to trace failures.

## Release gate

Public marketplace release is blocked until:

- Monitoring is enabled for the API, web app, database, and object storage.
- Alerts route to a responsible operator.
- A smoke check has passed after the final production deployment.
- A rollback path for the latest deployment is documented outside the repository.
