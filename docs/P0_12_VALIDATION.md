# P0-12 validation contract

Seller identity and business verification is eligible for review only after the exact branch head passes the full preflight gate.

The required validation includes:

- repository policy enforcement;
- frozen dependency installation;
- fresh, repeated, legacy-adoption, and base-to-head upgrade migrations;
- TypeScript checks;
- complete API and web tests;
- API production build;
- web production build;
- Flutter analysis; and
- complete mobile tests.

The seller-verification coverage includes provider-session configuration and transport, signed event verification and replay handling, operations-only final review, database approval guards, self-review prohibition, verification expiry and reverification, business-subject change invalidation, exact protected web routes, and bounded mobile handoff behavior.

A provider result never marks a seller as marketplace-verified without a separate operations review decision.
