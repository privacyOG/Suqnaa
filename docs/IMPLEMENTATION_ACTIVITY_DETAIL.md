# Activity detail implementation

The implementation is isolated on `feature/activity-detail` and deliberately avoids schema changes.

## Delivered

- Participant-only activity list and detail API routes.
- Deterministic progress mapping from existing transaction states.
- Buyer/seller role and counterpart context.
- Bilingual history and detail pages.
- Browser transport and progress regression tests.
- Existing same-origin authenticated proxy preserved.

## Deliberately deferred

- Mutating fulfilment states.
- Payment-provider calls.
- Shipping labels or tracking integrations.
- Participant acknowledgements.

Those operations require a separate state-transition design and stronger audit rules.
