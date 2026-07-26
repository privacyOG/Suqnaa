# Deferred marketplace features

The following capabilities are deliberately unavailable through the API until their complete protected implementations are approved:

- timed sales and bidding;
- buyer and seller disputes; and
- seller identity or business verification submission.

## Quarantine boundary

- No route module for these capabilities exists in the active API source tree.
- No route is imported or registered by `apps/api/src/server.ts`.
- A regression test fails if the removed route files or registrations return.
- Existing database tables are reserved data-model groundwork only and do not create a network surface.
- Documentation must describe these capabilities as deferred rather than implemented.

## Reintroduction requirements

A capability may return only as a complete, separately reviewed implementation with:

1. authenticated actor identity derived from the access session rather than request-supplied user identifiers;
2. explicit participant, ownership, or operations-role authorization;
3. persistent transactional state transitions and database constraints;
4. bounded request validation, rate limits, human verification where appropriate, and idempotency;
5. security and operations audit records;
6. abuse, fraud, privacy, retention, and moderation policy;
7. API integration tests and authorization-boundary tests;
8. protected English and Arabic web interfaces; and
9. protected mobile interfaces or an exact secure-web handoff.

Schema objects for a deferred capability must not be interpreted as product availability. Public launch documentation and deployment configuration must keep the capability disabled until its release gate is complete.
