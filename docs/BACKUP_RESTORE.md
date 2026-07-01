# Backup and restore runbook

This runbook defines the minimum operational checks needed before a public marketplace release.

## Scope

Suqnaa production data includes:

- PostgreSQL database data, including users, listings, messages, offers, reports, and operation logs.
- Object storage data, including listing media objects.
- Deployment configuration and secret-manager entries.

## Required production controls

- Automated PostgreSQL backups must run at least daily.
- PostgreSQL backups must be encrypted at rest.
- Object storage versioning or equivalent rollback protection must be enabled.
- Object storage lifecycle rules must not delete active listing media.
- Secret-manager exports must not be stored in the repository.
- Backup access must be limited to production operators only.

## Restore drill

Before public launch, complete a restore drill in a non-production environment:

1. Create a fresh database.
2. Restore the latest database backup.
3. Point a staging API deployment at the restored database.
4. Verify account login, listing browse, listing detail, media delivery, messages, offers, and reports.
5. Verify object storage media referenced by restored rows can be delivered.
6. Record the restore timestamp, backup timestamp, operator, and result outside the repository.

## Recovery objectives

Initial launch targets:

- Recovery point objective: 24 hours or better.
- Recovery time objective: 4 hours or better for database restore and API redeploy.

These targets must be reviewed after production traffic volume is known.

## Release gate

Public marketplace release is blocked until:

- At least one successful restore drill has been completed.
- The restored environment has passed the core marketplace smoke test.
- Backup ownership and escalation contacts are documented outside the repository.
