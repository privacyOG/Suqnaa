# L-01 production-like staging smoke gate

L-01 requires a production-like staging deployment plus an automated marketplace smoke journey covering registration, listing, messaging, offer, order, sandbox payment, fulfilment, moderation, and dispute handling.

## What the gate deploys

`.github/workflows/staging-smoke.yml` builds the repository's normal production Docker targets and boots them against the normal application network. The ephemeral staging dependency set is PostgreSQL/PostGIS, Redis, the dedicated queue Redis instance, and S3-compatible private object storage. The application set is the API, web app, listing/discovery/notification/settlement/dispute/return workers, and the normal migration image.

The workflow uses `deploy/compose.production.yml` and `deploy/compose.infrastructure.yml`. The two `compose.staging-smoke.*.yml` files are CI-only overlays that expose the API, web app, and PostgreSQL on loopback so the external smoke client can probe the deployed containers. They do not weaken the production Compose definitions or publish Redis, queue, or object-storage ports.

Real staging and production secrets remain outside the repository. The workflow creates short-lived synthetic CI credentials, destroys the environment after the job, and uploads container status/log evidence only on failure.

## Deployed smoke journey

`apps/api/src/integration/staging-smoke.deployed.integration.test.ts` does not register Fastify routes in-process. It talks to the running API through HTTP and verifies this sequence:

1. API readiness and real account registration for a seller, buyer, and synthetic operations user.
2. Controlled staging activation of those synthetic accounts and assignment of the existing `platform_admin` role to the operations fixture.
3. Seller listing creation and publication.
4. Buyer-to-seller listing-context message creation.
5. Buyer offer creation and seller acceptance.
6. Buyer order creation and pickup selection.
7. Protected-checkout preparation followed by a signed provider-neutral `staging_sandbox` held-payment event; the order must become `paid` and the payment intent `held`.
8. Seller pickup-location disclosure, seller `ready_for_pickup`, buyer proof issuance, seller proof verification, and buyer receipt confirmation.
9. A separate seller listing is taken down through the protected operations moderation route using the synthetic operator.
10. The buyer opens a dispute on the paid order, the seller responds, and the synthetic operator starts protected operations review.
11. Final database assertions confirm the durable order/payment/fulfilment state produced through the deployed API boundary.

Direct database access is intentionally restricted to smoke-fixture control and final durable-state assertions. Marketplace actions themselves use the deployed HTTP API.

## Completion rule

L-01 is complete only when the `Staging Smoke` workflow is green on the exact pull-request head together with the repository's normal required regression/preflight gates. A local service mock or an in-process Fastify test is not sufficient evidence for this launch gate.
