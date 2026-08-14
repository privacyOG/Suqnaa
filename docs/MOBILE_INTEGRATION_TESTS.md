# Mobile integration verification

P1-17 verifies Suqnaa's Flutter marketplace client on real platform runtimes rather than treating widget tests or native compilation alone as mobile integration evidence.

## Required platform gate

`.github/workflows/mobile-integration.yml` runs the same `integration_test/marketplace_journeys_test.dart` suite on:

- an Android 35 Google APIs x86_64 emulator on the Linux hosted runner;
- an available iPhone simulator on the macOS hosted runner.

Both jobs resolve the repository Flutter application and execute `flutter test ... -d <native device>`. A successful APK/iOS compile without executing the integration suite does not satisfy this batch.

## Covered marketplace boundaries

The integration suite covers the tracker-required mobile surfaces:

- authentication: submits the production sign-in widget through an injected `AuthApi` fixture and proves the native `AppSession` is established;
- catalogue: renders `HomeScreen` through the production `CatalogGateway` boundary;
- listing management: opens the signed-in `MyListingsScreen` from the account experience;
- media: opens the signed-in `ListingMediaManagerScreen`;
- messages: opens `SessionConversationInbox`;
- offers: calls the production `TradingApi.submitOffer` transport and verifies method, endpoint, bearer authentication, JSON body, and response parsing;
- orders: opens `OrderActivityScreen`;
- payments: opens `PaymentPreparationScreen`;
- fulfilment: opens `OrderFulfilmentScreen`.

The fixture boundary is intentional: P1-17 is a client integration gate for Android and iOS and must remain deterministic and independent of developer machines, production accounts, external providers, and production data. Database-backed and browser-backed full-stack journeys remain covered by the separate API Database Integration and Browser E2E gates.

## Security and privacy boundary

Integration fixtures use non-production placeholder identities and tokens. No real credentials, provider secrets, customer records, payment data, or precise private location data belong in the suite or workflow artifacts.

The offer integration check exercises the actual authenticated mobile transport rather than duplicating or mocking its serialization logic outside `TradingApi`.

## Completion rule

P1-17 is complete only when both native integration jobs and the normal exact-head repository regression/preflight gates succeed on the merge candidate. Android-only, iOS-only, build-only, or source-level tests are insufficient evidence.
