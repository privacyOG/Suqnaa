# Browser end-to-end verification

P1-16 verifies the production web application in a real Chrome browser against the built Next.js web app, built Fastify API, and a freshly migrated PostgreSQL/PostGIS database.

## Covered journeys

The Playwright suite executes six isolated journeys:

- English buyer
- Arabic buyer
- English seller
- Arabic seller
- English operations administrator
- Arabic operations administrator

Each journey signs in through the actual web authentication form, establishes the normal secure web session, and then traverses role-appropriate application routes. Buyer journeys load a real public listing and protected messaging surface. Seller journeys load the authenticated listing-management surface containing the seeded listing and then the listing-creation route. Operations journeys load the permission-aware administration dashboard after the seeded account is bootstrapped through the repository RBAC service.

Arabic journeys additionally assert the RTL document boundary while using Arabic labels and navigation text.

## Test data and isolation

`apps/api/src/integration/browser-e2e-seed.ts` creates unique buyer, seller, and operations accounts through the real Fastify registration route, models successful contact verification/activation in PostgreSQL, bootstraps the operations role with the production RBAC service, and inserts one deterministic public listing.

The resulting identifiers and test-only credentials are written to the ignored `apps/web/e2e/.seed.json` file. The CI database is disposable; no production provider credentials, production accounts, or production data are used.

## CI gate

`.github/workflows/browser-e2e.yml`:

1. provisions PostGIS 16 / PostgreSQL 16;
2. installs the frozen pnpm dependency graph;
3. verifies and targets the Chrome installation supplied by the GitHub-hosted Ubuntu runner, avoiding a second browser download during the gate;
4. applies the complete migration ledger;
5. builds the API and web production bundles;
6. seeds isolated browser test data;
7. starts the built API and web servers through Playwright `webServer` orchestration;
8. runs all six browser journeys with one worker to keep shared database state deterministic;
9. uploads traces, screenshots, videos, and the HTML report only when the run fails.

Local runs can use Playwright's normal bundled Chromium when `CI` is not set; CI explicitly selects the hosted Chrome channel.

## Completion rule

P1-16 is complete only when the Browser E2E gate and the normal exact-head repository regression gates are green on the merge candidate. Source-level surface tests or mocked network routes do not satisfy this gate.
