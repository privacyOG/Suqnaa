# Production security operations

This runbook defines the P1-08 production security contract for human verification, browser origins, edge headers, secret rotation, dependency review, and scheduled security review.

## Production human verification

Production must start with all of the following configured:

- `CHALLENGE_PROVIDER=turnstile`;
- `TURNSTILE_SITE_KEY` containing the public site key;
- `TURNSTILE_SECRET_KEY_FILE=/run/secrets/turnstile_secret_key` with the server-only secret mounted by Compose;
- `TURNSTILE_EXPECTED_HOSTNAME` exactly equal to the hostname in `WEB_ORIGIN`;
- `NEXT_PUBLIC_CHALLENGE_SCRIPT_URL=https://challenges.cloudflare.com/turnstile/v0/api.js`.

Production startup fails before the API begins listening when this contract is incomplete, when an inline challenge secret is supplied, when the expected hostname does not match `WEB_ORIGIN`, or when the challenge script URL is not the approved URL.

The public `/v1/challenge/config` response exposes only the provider state, public site key and action names. It must never expose the server secret.

## Exact browser origin and CORS

`WEB_ORIGIN` is a single exact HTTPS origin in production. It must not contain credentials, a path, query, fragment, wildcard, local hostname, or trailing slash.

The API returns CORS allow headers only when the request `Origin` value exactly equals `WEB_ORIGIN`. Preflight requests from any other origin receive HTTP 403. Do not add reflected-origin, wildcard-origin, regex-origin, or comma-separated multi-origin behavior without a separate security review and regression tests.

When production web hosting moves to a new hostname, update `WEB_ORIGIN` and `TURNSTILE_EXPECTED_HOSTNAME` together and validate the challenge provider hostname configuration before routing traffic.

## Edge response headers

Caddy is the production TLS edge and removes its server banner. Both web and API responses receive:

- HSTS with a two-year lifetime, includeSubDomains and preload;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Frame-Options: DENY`;
- a restrictive camera, microphone, geolocation, payment and USB permissions policy.

The web surface additionally blocks framing/object embedding through CSP and upgrades insecure subresource requests. The API uses `default-src 'none'`, `frame-ancestors 'none'`, and `base-uri 'none'`.

Changes to CSP must be tested against authentication, challenge rendering, checkout redirects and all web production builds before release. Do not weaken headers to fix an unrelated integration without documenting the exact requirement.

## Secret rotation

File-backed production secrets are kept under `SUQNAA_SECRET_DIR` and must remain outside Git. Use an operator-generated replacement file that is not stored in shell history or tickets, then atomically replace the active file with:

```bash
SUQNAA_SECRET_DIR=/secure/suqnaa/production \
  bash deploy/rotate-file-secret.sh turnstile_secret_key /secure/staging/new-turnstile-secret
```

The helper validates the secret name against the tracked production secret contract, copies it into a mode-0600 temporary file in the destination directory, rejects empty replacements, atomically renames it over the active file, and prints only the secret name—not the value.

After file replacement, recreate every service that mounts the secret. For `turnstile_secret_key`, recreate the API and verify API readiness plus a challenge-protected registration/login action before declaring rotation complete.

### Rotation classes

- **Provider/API credentials** such as human-verification, observability and object-storage credentials: provision the replacement at the provider where needed, atomically replace the local secret, recreate affected services, verify, then revoke the old credential.
- **Infrastructure passwords** such as PostgreSQL/Redis credentials: coordinate server-side credential change and application secret replacement so both sides have a controlled overlap or maintenance window.
- **Signing keys and password peppers:** do not rotate blindly. The current application uses single active values for some signing/data-derivation secrets. Rotating them without a compatibility plan can invalidate sessions or password verification. Treat emergency rotation of these values as an incident requiring explicit reauthentication/password-reset planning or a dedicated dual-key migration implementation.
- **Backup decryption identity:** rotation requires creating new backups encrypted to the new recipient while preserving the old identity until every retained backup encrypted to it expires or is re-encrypted and verified.

Record the secret name, rotation reason, UTC start/end time, operator, affected services, verification result and old-credential revocation time. Never record the value itself.

## Dependency scanning

The scheduled security workflow runs weekly and on manual dispatch. It installs the frozen Node dependency graph and runs `pnpm audit --audit-level high`; a high/critical advisory fails the dependency-audit job and requires triage before the next production release.

Dependabot checks the npm workspace, GitHub Actions, production/backup Dockerfiles and Flutter `pub` dependencies weekly. Dependency PRs still pass the normal Quality Gate before merge.

Do not automatically merge security dependency updates solely because they are automated. Review release notes, transitive changes, runtime compatibility, image provenance and marketplace-security impact.

## Scheduled security review

The weekly workflow also runs repository policy and the production-security static validator. In addition, operators perform a documented manual review at least monthly and after every SEV-1 security/privacy incident.

The manual review covers:

1. human-verification provider status, hostname restrictions and protected-action coverage;
2. exact production `WEB_ORIGIN`, API CORS behavior and edge/TLS headers;
3. production secret inventory, age, ownership, file permissions and rotation exceptions;
4. outstanding Dependabot/advisory findings and intentionally deferred dependency upgrades;
5. repository policy, branch protection and required checks;
6. exposed ports, dashboards, object storage, database, queues and administrative surfaces;
7. authentication/session anomalies, abuse signals, payment/provider webhook failures and security alerts;
8. backup/restore and incident-response changes that alter confidentiality or recovery assumptions.

Record each review date, reviewer, findings, severity, owner and remediation deadline outside secret-bearing logs. Open repository issues only for findings that can be described without credentials, private customer data or exploit-sensitive evidence.

## Release gate

A production release must not proceed when:

- production human verification fails startup validation;
- the exact origin/CORS contract is unknown or intentionally bypassed;
- required edge security headers are absent;
- a high/critical dependency advisory has no documented disposition;
- a required secret is exposed, unreadable, empty or awaiting emergency rotation;
- the latest scheduled/manual security review has an unresolved release-blocking finding.
