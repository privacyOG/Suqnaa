# Role-based administration

Suqnaa administrative access is persisted in PostgreSQL and is evaluated on every protected operations request. Runtime authorization does not use an environment allowlist and administrative roles are not embedded in access-token claims.

## System roles

- `platform_admin`: all current administrative permissions, including role management.
- `trust_reviewer`: seller/business verification read and review.
- `moderation_reviewer`: report-queue read and resolution without listing/account state changes.
- `moderation_manager`: moderation review plus listing and account state changes.
- `audit_reviewer`: read-only protected operations audit access.

The seeded roles are system roles. The permissions beneath them are explicit records in `admin_permissions` and `admin_role_permissions` so authorization decisions remain inspectable and durable.

## Permissions

Current permissions are:

- `operations.access`
- `moderation.queue.read`
- `moderation.queue.resolve`
- `moderation.listing.manage`
- `moderation.account.manage`
- `verification.read`
- `verification.review`
- `audit.read`
- `roles.read`
- `roles.manage`

Existing operations routes map to the narrow permission required for that action. Effective permissions are recalculated from active role assignments on each protected request, so a revocation takes effect immediately even if an older access token has not expired.

## Initial administrator bootstrap

After migration `017_role_based_administration.sql` is applied, bootstrap exactly one existing active account from a trusted deployment shell:

```bash
pnpm --filter suqnaa-api admin:bootstrap -- <active-user-uuid>
```

The command refuses to run once any active `platform_admin` assignment exists. It writes both the durable assignment and an `operations.roles.bootstrap` audit record. It does not consume or create a runtime allowlist.

## Protected role changes

Role management is exposed through the authenticated operations API and the bilingual web page at `/{locale}/operations/access`.

A role grant or revocation requires `roles.manage`. The service also independently checks that permission inside the transaction. Additional controls are:

- administrators cannot change their own roles;
- target accounts must be active for new grants;
- an actor cannot grant or revoke a role containing a permission the actor does not hold;
- active assignments are unique for each user/role pair;
- revocation updates the historical assignment with actor, time, and optional reason instead of deleting it;
- the service prevents removal of the last platform administrator when such a cross-account change is attempted;
- role mutations are rate limited and audited.

## Audit history

Role bootstrap, grant, and revoke actions write `operations.roles.*` entries to `audit_logs`. Assignment history is also retained in `admin_role_assignments`, including grant actor/time and revoke actor/time/reason.

The existing `/v1/operations/records` view includes these records because it reads the `operations.*` audit namespace. Access to that view requires `audit.read`.

## Operational notes

Suspended or closed accounts fail the normal protected-account check before administrative permissions are evaluated. Their role assignments remain in the database for history but cannot be used while the account is unavailable.

Role-management endpoints accept exact account UUIDs rather than broad account-search inputs. The larger administration dashboard and richer staff directory remain part of the later administration-dashboard work.
