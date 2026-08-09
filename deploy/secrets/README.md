# Production secret files

This directory documents the file names consumed by `deploy/compose.infrastructure.yml`. Actual secret values are ignored by Git and must be provisioned on the deployment host or injected by the deployment platform.

Required files:

- `postgres_password`
- `redis_password`
- `object_storage_root_user`
- `object_storage_root_password`

Use a separate secret directory for each environment and point Compose at it with `SUQNAA_SECRET_DIR`. Restrict the directory to the deployment account and do not copy these values into `.env.production`, image build arguments, CI logs, or repository files.

Application credentials should use least-privilege identities distinct from infrastructure root/bootstrap credentials. The root object-storage credentials in this directory are for bootstrap/administration only; application S3 access keys must be provisioned separately before production rollout.
