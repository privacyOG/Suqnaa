# Launch performance gates

P1-18 is a launch-blocking performance certification, not a production capacity claim. The CI suite runs against a clean PostGIS database on a hosted runner with synthetic, non-customer data and exercises the same database, listing, media, notification-queue and signed payment-event primitives used by the application.

## Fixture scale

The benchmark creates an isolated active seller with:

- 3,000 active listings with deterministic creation timestamps;
- 500 listing-media rows;
- 500 pending durable notification deliveries.

The fixture account is deleted after the run. No production accounts, secrets, payment credentials, object-storage records or customer data are used.

## Explicit launch thresholds

| Scenario | Workload | Launch threshold |
| --- | --- | --- |
| Load | 120 public marketplace listing requests at concurrency 12 | p95 <= 1,200 ms and >= 8 requests/s |
| Concurrency | 100 concurrent listing-row update transactions at concurrency 20 | p95 <= 300 ms |
| Pagination | At least 20 sequential pages / 1,000 records through the public listing cursor | p95 <= 1,400 ms |
| Media | 8 real ImageMagick public/thumbnail transformations at concurrency 2 | p95 <= 3,000 ms |
| Queue | 8 simultaneous `FOR UPDATE SKIP LOCKED` outbox claims, batch size 25 | p95 <= 1,800 ms, at least 200 unique rows claimed, zero duplicate claims |
| Payment event | 1,000 signed payment-event HMAC/schema verifications at concurrency 10 | p95 <= 25 ms and >= 100 events/s |
| Database | 300 indexed listing ownership/look-up queries at concurrency 20 | p95 <= 150 ms |

Any failed threshold fails the `Launch Performance` workflow. The workflow emits `performance-report.json` plus the API log as a retained artifact so regressions have measurable evidence.

## What this gate proves

The gate is designed to catch launch-blocking regressions in query shape, N+1 listing work, connection-pool contention, cursor pagination, media transform cost, queue lock contention, payment-event verification cost and indexed database access. It also verifies queue exclusivity under concurrency: a delivery claimed by one worker must not be claimed by another worker in the same wave.

These values are deliberately conservative for shared CI hardware. They are minimum launch thresholds and do not replace production observability, staging soak tests, capacity planning or autoscaling policy. A threshold should be tightened only after repeated staging measurements establish a stable lower bound; it must not be weakened merely to make a failing change green.

## Running the gate

The GitHub workflow provisions PostgreSQL/PostGIS, installs ImageMagick, applies the complete migration ledger, starts the real API process, executes the benchmark harness and uploads the JSON report. The harness can also be run against an isolated local database/API with `DATABASE_URL`, `PERFORMANCE_API_BASE_URL` and the normal API test environment configured.
