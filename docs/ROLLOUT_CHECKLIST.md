# Rollout checklist

This checklist defines the minimum promotion steps for a Suqnaa production build.

## Before promotion

Verify the release candidate has:

- CI, API and Web CI, and Mobile CI passing.
- Current database backup completed.
- Production environment values configured.
- Object storage configured and reachable.
- Web and API health checks available.
- Smoke-check operator assigned.

## Promotion steps

1. Deploy the API build.
2. Confirm the API health endpoint responds.
3. Confirm database connectivity.
4. Deploy the web build.
5. Confirm the web app loads over HTTPS.
6. Run the smoke checks listed in `docs/RUNTIME_CHECKS.md`.
7. Confirm listing browse, listing detail, login, draft listing creation, media delivery, messages, offers, and reports.
8. Confirm monitoring signals remain normal after promotion.

## Stop conditions

Do not continue promotion when any of these are seen:

- API health endpoint unavailable.
- Web app unavailable.
- Database connection failures.
- Object storage delivery failures.
- Elevated server errors.
- Login or session failures.
- Failed marketplace smoke check.

## Recovery steps

When a promotion fails:

1. Keep the previous working build available.
2. Return API and web services to the previous known-good build when needed.
3. Verify API health, web load, login, listing browse, listing detail, and media delivery.
4. Record the failed commit, symptoms, action taken, operator, and result outside the repository.

## Release gate

Public marketplace release is blocked until this checklist has been rehearsed in a production-equivalent environment and the current release candidate passes the smoke-check sequence.
