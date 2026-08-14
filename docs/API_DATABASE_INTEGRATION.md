# API database-backed integration journeys

P1-15 verifies that the marketplace's database-backed domains compose correctly against the real PostgreSQL/PostGIS schema and migration ledger.

## Dedicated gate

`.github/workflows/api-db-integration.yml` provisions `postgis/postgis:16-3.4`, installs the locked monorepo dependencies, applies the complete migration ledger with `scripts/migrate-database.mjs`, and then executes `scripts/run-api-db-integration.sh`.

The suite must run against a freshly migrated database. It does not mock Kysely or PostgreSQL persistence.

## Journey coverage

The integration runner covers every domain named by P1-15:

- **Account:** register buyer and seller accounts through the Fastify authentication route, verify the durable `pending` registration state, then model completed contact verification before marketplace participation and verify the persisted `active` state.
- **Listing:** exercise database-backed listing lifecycle/inventory transitions and use an active listing as the shared marketplace aggregate for communication and commerce.
- **Message:** send a listing-context message through the API and verify the persisted conversation participants, listing relationship, sender, and idempotency identifier.
- **Offer:** create an offer through the API, verify idempotent replay, and have the seller accept it through the offer workflow.
- **Order:** verify accepted-offer reservation and create an order through the API with idempotent replay and persisted buyer/seller/listing/amount relationships.
- **Payment:** verify the automatically created payment intent and run the existing database-backed payment-operation journey for held funds, dual control, refunds, and chargebacks.
- **Fulfilment:** run the delivery/pickup database journey covering shipping amount locks, fulfilment records, and privacy-safe fulfilment state.
- **Dispute:** run the database-backed dispute journey covering participant response, review, payment-operation request, appeal, and deadline escalation.
- **Moderation:** execute a real listing takedown, durable evidence/audit record, seller appeal, independent overturn, and listing restoration.
- **Payout:** run seller settlement through ledger generation, transfer, adjustment reversal, and payout-account failure handling with a deterministic provider stub.

## Test isolation

New integration tests use unique UUID/email namespaces and explicitly remove the state that they create. Existing mature database journey tests run in separate `tsx` processes, so each process receives a fresh Kysely pool while sharing only the migrated test database.

No production provider credentials are used. External money-movement calls use deterministic test providers already present in the repository.

## Completion rule

P1-15 is complete only when the dedicated API Database Integration gate and the normal exact-head repository gates are green on the merge candidate. A source-only test manifest is not sufficient; every database journey must execute successfully against the migrated PostgreSQL/PostGIS service.
