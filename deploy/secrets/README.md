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

Use a separate secret directory for each environment and point Compose at it with `SUQNAA_SECRET_DIR`. Restrict the directory to the deployment account and do not copy these values into `.env.production`, image build arguments, CI logs, or repository files.

`observability_metrics_token` must contain at least 32 characters in production. The exact same secret file is mounted into the API and Prometheus, so the scrape credential never needs to be duplicated in environment variables. Rotate it by replacing the secret and restarting the API and Prometheus together.

`grafana_admin_password` protects the bootstrap administrator account. Grafana is bound to `127.0.0.1` by default and must not be exposed publicly without the same edge authentication and access controls used for other operations surfaces.

The general Redis credential and durable queue credential must be distinct. Queue storage uses a separate Redis instance so cache/state memory policy cannot evict background work.

Application credentials should use least-privilege identities distinct from infrastructure root/bootstrap credentials. The root object-storage credentials in this directory are for bootstrap/administration only; application S3 access keys must be provisioned separately before production rollout.
