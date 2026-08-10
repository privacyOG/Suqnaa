# Production secret files

This directory documents the file names consumed by the production Compose definitions. Actual secret values are ignored by Git and must be provisioned on the deployment host or injected by the deployment platform.

Required files:

- `postgres_password`
- `redis_password`
- `queue_password`
- `object_storage_root_user`
- `object_storage_root_password`
- `observability_metrics_token`
- `grafana_admin_password`
- `backup_database_url`
- `backup_age_recipient`
- `backup_object_storage_access_key`
- `backup_object_storage_secret_key`
- `backup_age_identity`
- `restore_database_url`
- `restore_object_storage_access_key`
- `restore_object_storage_secret_key`

Use a separate secret directory for each environment and point Compose at it with `SUQNAA_SECRET_DIR`. Restrict the directory to the deployment account and do not copy these values into `.env.production`, image build arguments, CI logs, or repository files.

`observability_metrics_token` must contain at least 32 characters in production. The exact same secret file is mounted into the API and Prometheus, so the scrape credential never needs to be duplicated in environment variables. Rotate it by replacing the secret and restarting the API and Prometheus together.

`grafana_admin_password` protects the bootstrap administrator account. Grafana is bound to `127.0.0.1` by default and must not be exposed publicly without the same edge authentication and access controls used for other operations surfaces.

## Backup and restore credentials

`backup_age_recipient` contains only the public age recipient used to encrypt backup components. The scheduled `backup` service receives this public recipient but **does not receive** `backup_age_identity`.

`backup_age_identity` is the private age identity required to decrypt backups. Keep it offline or in the staging restore secret set and mount it only into the explicit `restore-drill` profile. Losing this identity makes encrypted backups unrecoverable; exposing it defeats backup confidentiality.

`backup_database_url` should belong to a dedicated PostgreSQL backup role with the minimum privileges required by `pg_dump`. Do not reuse the application password or PostgreSQL bootstrap password unless performing an emergency recovery procedure.

`backup_object_storage_access_key` and `backup_object_storage_secret_key` should identify a dedicated read/list-only S3 principal scoped to the buckets in `SUQNAA_BACKUP_S3_BUCKETS`. The backup service does not require delete or write permission on source object storage.

`restore_database_url` and the `restore_object_storage_*` pair are staging restore credentials with destructive write privileges. Keep them distinct from production credentials. The restore script refuses non-staging restoration unless the destructive production-restore acknowledgement is explicitly supplied.

The general Redis credential and durable queue credential must be distinct. Queue storage uses a separate Redis instance so cache/state memory policy cannot evict background work.

Application credentials should use least-privilege identities distinct from infrastructure root/bootstrap credentials. The root object-storage credentials in this directory are for bootstrap/administration only; application S3 access keys must be provisioned separately before production rollout.
