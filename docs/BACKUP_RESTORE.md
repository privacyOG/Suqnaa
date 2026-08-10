# Backup and restore runbook

P1-06 protects PostgreSQL and private object storage with scheduled encrypted backups and a destructive staging restore drill.

## Scope

Suqnaa production data includes:

- PostgreSQL database data, including users, listings, messages, offers, payments, disputes, settlement records, reports, and operation logs.
- Private S3-compatible object storage, including listing media and other approved marketplace objects.
- Deployment configuration and secret-manager entries. Secret material itself is not copied into backup artifacts by these jobs.

## Security model

The scheduled backup service receives only:

- a dedicated PostgreSQL backup URL;
- a public age recipient;
- a read/list-only S3 access key and secret;
- the configured list of source buckets.

The backup service never receives the age private identity.

`pg_dump` is streamed directly into age encryption. Object bodies are streamed from S3 through age one at a time. The only plaintext backup metadata is the temporary object manifest under `/work`; `/work` is a tmpfs mount and the manifest is removed before a backup is marked complete.

The private age identity is mounted only into the explicit `restore-drill` Compose profile. Restore credentials are staging write credentials and must remain distinct from production application and backup credentials.

## Backup layout

A successful backup contains only encrypted payload components plus integrity metadata:

```text
/backups/suqnaa-20260810T090000Z/
  COMPLETE
  checksums.sha256
  database.dump.age
  object-manifest.tsv.age
  objects/
    <sha256-of-bucket-and-key>.age
```

Incomplete directories are automatically removed. The restore path verifies `checksums.sha256` before any decryption occurs.

The default production schedule is every 24 hours with 30-day local encrypted retention. Staging defaults to 14 days. The scheduler rejects intervals below one hour.

The encrypted backup volume is not an independent failure domain. Production operations must replicate completed encrypted backup directories to independent storage or a separate host with its own access controls. The off-host target receives only age-encrypted artifacts and must not receive the private age identity.

## Required identities

Provision the files documented in `deploy/secrets/README.md`.

For PostgreSQL, create a dedicated backup role with the minimum read privileges required by `pg_dump`. For S3/MinIO, create a dedicated principal with list/read permission only to every bucket in `SUQNAA_BACKUP_S3_BUCKETS`.

Generate the age key pair outside the production host where practical:

```bash
age-keygen -o backup-age-identity.txt
age-keygen -y backup-age-identity.txt > backup-age-recipient.txt
```

Place only the recipient in the production backup secret set. Keep the identity offline and provision it to the staging restore environment only for recovery testing.

## Starting automated backups

The infrastructure Compose stack includes the `backup` service. With environment-specific configuration and secrets in place:

```bash
cd deploy
docker compose \
  --env-file environments/production.infrastructure.example \
  -f compose.infrastructure.yml \
  up -d postgres object-storage backup
```

Successful scheduled runs emit `backup_completed` and `scheduled_backup_success` JSON events. A failed attempt emits `scheduled_backup_failure` and the scheduler retries at the next configured interval.

Force a backup without waiting for the scheduler:

```bash
cd deploy
docker compose -f compose.infrastructure.yml run --rm --no-deps backup \
  /opt/suqnaa-backup/backup.sh
```

Never troubleshoot by copying plaintext `.sql`, `.dump`, object trees, or decrypted manifests into the durable backup volume.

## Staging restore drill

Restoration is destructive to the target database and configured object buckets. The restore script defaults to `RESTORE_ENVIRONMENT=staging` and refuses any other environment unless an explicit destructive production-restore acknowledgement is supplied.

Before a staging drill:

1. verify the selected backup directory contains `COMPLETE` and `checksums.sha256`;
2. provision `backup_age_identity` only to staging;
3. provision staging `restore_database_url` and S3 write credentials;
4. set `SUQNAA_RESTORE_ENVIRONMENT=staging`;
5. record the backup ID and staging state before destruction.

Restore the latest complete backup:

```bash
cd deploy
docker compose \
  --profile restore-drill \
  -f compose.infrastructure.yml \
  run --rm --no-deps restore-drill
```

Set `SUQNAA_RESTORE_BACKUP_ID` to restore a specific backup.

The drill verifies:

- encrypted component SHA-256 checksums before decryption;
- PostgreSQL custom-dump restoration with `--exit-on-error`;
- presence of the migration ledger after restore;
- decryption and restoration of every object in the encrypted manifest;
- restored object count equals manifest object count.

Success emits `restore_drill_completed` with the environment, backup ID, migration count, and object count.

## Continuous recovery proof

The repository Quality Gate executes the same boundary against an isolated staging-profile PostgreSQL/MinIO fixture. CI:

1. seeds a migration-ledger row, a database probe row, and an object-storage probe object;
2. generates an ephemeral age key pair;
3. creates a fully encrypted backup through the production backup image;
4. mutates the database row and deletes the object;
5. restores through the staging-only restore service;
6. verifies the original database value and exact object bytes;
7. verifies durable backup storage contains encrypted artifacts and no plaintext `.dump`, `.sql`, or `.tar` backup files.

This automated staging restore drill is a regression gate. Operators must additionally run the same staging procedure after material database, object-storage, encryption-key, or deployment changes and record the backup ID, restore timestamp, operator, and outcome in the deployment change record.

## Recovery objectives

Initial launch targets remain:

- Recovery point objective: 24 hours or better.
- Recovery time objective: 4 hours or better for database/object restore and API redeploy.

These targets must be reviewed after production traffic and data volume are known.

## Production restore emergency boundary

Production restore is intentionally not a routine job. It requires incident/change authorization, a verified backup, a traffic/maintenance plan, and this exact acknowledgement:

```text
ALLOW_PRODUCTION_RESTORE=I_UNDERSTAND_THIS_DESTROYS_DATA
```

Do not persist that value in Compose or environment files.

## Release gate

Public release remains blocked until backup ownership/escalation contacts exist outside the repository and the staging environment has passed the broader marketplace smoke journey after restoration. The automated encrypted restore drill proves the backup mechanics continuously; launch operations remain responsible for the complete application-level staging acceptance check.
