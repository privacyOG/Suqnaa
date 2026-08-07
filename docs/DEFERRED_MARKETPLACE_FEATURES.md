# Deferred marketplace features

The following capabilities are deliberately unavailable through the API until their complete protected implementations are approved:

- timed sales and bidding; and
- buyer and seller disputes.

Seller identity and business verification is no longer part of this deferred set. Its replacement implementation uses dedicated `seller-verification` routes with authenticated seller initiation/status, provider-neutral hosted-session integration, signed replay-protected provider results, operations-only final review, expiry/reverification, and protected web/mobile surfaces.

## Quarantine boundary

- No legacy route module for auctions, disputes, or the retired generic verification surface may return.
- No deferred auction or dispute route is imported or registered by `apps/api/src/server.ts`.
- The legacy `verification.ts` module and `verificationRoutes` registration remain prohibited even though the new seller-verification implementation is active.
- A regression test fails if the removed legacy route files or registrations return.
- Existing database tables for still-deferred capabilities are reserved data-model groundwork only and do not create a network surface.
- Documentation must describe timed sales/bidding and disputes as deferred rather than implemented.

## Reintroduction requirements

A deferred capability may return only as a complete, separately reviewed implementation with:

1. authenticated actor identity derived from the access session rather than request-supplied user identifiers;
2. explicit participant, ownership, or operations-role authorization;
3. persistent transactional state transitions and database constraints;
4. bounded request validation, rate limits, human verification where appropriate, and idempotency;
5. security and operations audit records;
6. abuse, fraud, privacy, retention, and moderation policy;
7. API integration tests and authorization-boundary tests;
8. protected English and Arabic web interfaces; and
9. protected mobile interfaces or an exact secure-web handoff.

Schema objects for a deferred capability must not be interpreted as product availability. Public launch documentation and deployment configuration must keep each deferred capability disabled until its release gate is complete.
