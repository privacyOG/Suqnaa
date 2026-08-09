# Production infrastructure

P1-02 provisions the shared state, queue, object-storage, secret, network, and TLS/domain infrastructure consumed by the production application containers introduced in P1-01.

## Topology

`deploy/compose.infrastructure.yml` provisions:

- `postgres` — PostgreSQL 16 with PostGIS, persistent data, private application-network access, and file-backed bootstrap password.
- `redis` — shared Redis state/cache service with AOF persistence and a private password.
- `queue` — a separate Redis instance for durable background queues, with AOF `appendfsync always` and `noeviction` so cache pressure cannot discard queued work.
- `object-storage` — private S3-compatible object storage with persistent data. Its administration credentials are bootstrap-only.
- `edge` — Caddy ingress publishing only ports 80/443 and routing the configured web/API domains with automatic TLS.

PostgreSQL, Redis, queue Redis, and object storage never publish host ports. They are reachable only over the named application network. The edge service joins both the public edge network and the private application network.

## Environment separation

Tracked example contracts are provided for both environments:

- `deploy/environments/staging.infrastructure.example`
- `deploy/environments/production.infrastructure.example`

They contain non-secret names, domains, network names, and the external secret-directory location. Keep populated deployment configuration outside the repository.

Use different network names, volumes, secret directories, domains, database names, credentials, and application data for staging and production. Never point staging application containers at production state services.

## Secrets

Actual infrastructure secret files are excluded by `.gitignore`. The required file names are documented in `deploy/secrets/README.md`.

At minimum, create a per-environment directory containing:

- `postgres_password`
- `redis_password`
- `queue_password`
- `object_storage_root_user`
- `object_storage_root_password`

Restrict the directory to the deployment account. Use distinct random values per environment and keep the general Redis, durable queue, database, and object-storage credentials independent.

The application should receive least-privilege runtime credentials through the deployment platform or the untracked application environment file. Do not pass secrets as image build arguments and do not commit populated environment files.

## Staging bring-up

Create DNS records for the staging web/API domains so they resolve to the staging edge host, then provision the staging secret directory referenced by the environment contract.

Validate before creating services:

```bash
docker compose \
  --env-file deploy/environments/staging.infrastructure.example \
  -f deploy/compose.infrastructure.yml \
  config
```

Start the infrastructure:

```bash
docker compose \
  --env-file deploy/environments/staging.infrastructure.example \
  -f deploy/compose.infrastructure.yml \
  up -d postgres redis queue object-storage edge
```

Populate an untracked application environment file with internal service endpoints. The expected Docker DNS names are `postgres`, `redis`, `queue`, and `object-storage`. The S3 endpoint is therefore private, for example `http://object-storage:9000`; do not expose the object-storage administration console publicly.

Start the application stack on the exact same application network name:

```bash
SUQNAA_APPLICATION_NETWORK=suqnaa-staging-application \
SUQNAA_ENV_FILE=../.env.staging \
NEXT_PUBLIC_API_BASE_URL=https://api.staging.example.invalid \
docker compose -f deploy/compose.production.yml up -d
```

Run the one-shot migration job before declaring the application rollout healthy.

## Production bring-up

Production follows the same sequence using `deploy/environments/production.infrastructure.example`, production-only secret material, production DNS, and production volumes. Replace every `example.invalid` placeholder before deployment.

Do not reuse staging secrets, object-storage identities, database data, Redis persistence, queue persistence, or TLS state in production.

## Object storage and delivery boundary

The object store is deliberately private. Application-facing S3 credentials must be least-privilege credentials scoped to the marketplace bucket rather than the bootstrap/root credentials used to initialise storage.

Public listing media must continue through the marketplace's controlled public-delivery surface or an approved CDN/origin configuration that cannot expose private bucket enumeration, administration APIs, or private evidence objects. CDN configuration must preserve the application's authorization boundary for non-public media.

## Queue boundary

The `queue` service is infrastructure for durable background work. It is isolated from general Redis specifically so `flush`, eviction, cache memory policy, or high-volume temporary state cannot destroy queued jobs. Queue consumers must use a dedicated credential/URL and idempotent job semantics before production cutover.

## TLS and domain routing

Caddy consumes three required non-secret values: web domain, API domain, and ACME contact email. Only the edge service publishes ports. Web and API remain internal Docker upstreams.

Before enabling public traffic:

1. point the intended DNS records at the edge host;
2. verify ports 80/443 reach only the edge service;
3. confirm web/API containers are not directly host-published;
4. confirm state services are inaccessible outside the application network;
5. validate certificate issuance and renewal;
6. verify trusted web origin, API URL, challenge-provider hostname, and CORS settings match the final domains.

## Validation

Repository validation is available with:

```bash
pnpm infrastructure:validate
```

Quality Gate also parses both production Compose files using CI-only dummy secret files. The static regression rejects missing state services, public state-service ports, missing persistent storage, missing secret references, a non-private application network, broken application-network sharing, and missing TLS/domain routing.

P1-02 is not complete merely because Compose parses. Final completion also requires verified staging/production configuration, least-privilege object-storage identities/buckets, queue consumer configuration, DNS/TLS verification, and an operational smoke check of service connectivity without exposing private state services.
