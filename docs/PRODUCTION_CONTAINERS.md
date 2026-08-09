# Production containers

P1-01 packages the Suqnaa application workloads. It does **not** provision production PostgreSQL/PostGIS, Redis, object storage/CDN, queues, TLS, secrets, or public domain routing; those are P1-02 infrastructure responsibilities.

## Images

`deploy/Dockerfile` has four production targets:

- `api` — compiled Fastify API, starts `apps/api/dist/server.js` on port 4000.
- `worker` — the same compiled API runtime and dependencies, with the notification worker as its default command. Deployment configuration overrides the command for each durable worker role.
- `web` — production Next.js build, starts on port 3000.
- `migrate` — one-shot migration image containing Node, PostgreSQL client tools, the migration ledger runner, manifest, and SQL files.

Runtime application images execute as the unprivileged `node` user. The Compose topology also drops Linux capabilities and enables `no-new-privileges`.

## Build

From the repository root:

```bash
docker build -f deploy/Dockerfile --target api -t suqnaa-api:release .
docker build -f deploy/Dockerfile --target worker -t suqnaa-worker:release .
docker build -f deploy/Dockerfile --target web \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_CHALLENGE_SCRIPT_URL=https://example.invalid/challenge.js \
  -t suqnaa-web:release .
docker build -f deploy/Dockerfile --target migrate -t suqnaa-migrate:release .
```

`NEXT_PUBLIC_API_BASE_URL` is intentionally a build-time input because browser bundles embed it. Never put secrets in Docker build arguments. Server-only credentials remain runtime environment/secrets.

## Runtime configuration

Create an untracked `.env.production` from `.env.example` and replace every development/default credential or endpoint with production values. The repository ignores `.env.production` and the Docker build context excludes environment files.

At minimum, application workloads require the appropriate values for:

- `DATABASE_URL` and `REDIS_URL` supplied by P1-02 infrastructure;
- API host/port and trusted `WEB_ORIGIN`;
- server-side `API_BASE_URL` and browser-side `NEXT_PUBLIC_API_BASE_URL`;
- authentication/verification peppers and signing secrets;
- production object-storage configuration;
- approved verification, notification, payment, settlement, and dispute settings applicable to the workload.

Do not store live secrets in the repository or baked image layers.

## Compose topology

Validate the production topology:

```bash
cp .env.example .env.production
NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  docker compose -f deploy/compose.production.yml config
```

Start application workloads after the infrastructure endpoints and secrets exist:

```bash
SUQNAA_ENV_FILE=../.env.production \
NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  docker compose -f deploy/compose.production.yml up -d api web \
  worker-listings worker-discovery worker-notifications \
  worker-settlements worker-disputes worker-returns
```

The Compose file deliberately uses `expose`, not host `ports`. Public ingress/TLS and private service routing belong to P1-02.

## Migrations

Migrations are a separate one-shot deployment job and must complete before application rollout proceeds:

```bash
SUQNAA_ENV_FILE=../.env.production \
NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  docker compose -f deploy/compose.production.yml --profile migrate run --rm migrate
```

The migration target uses the existing append-only manifest/ledger and PostgreSQL advisory lock. Do not replace this with application-startup auto-migration.

## Worker roles

The same immutable worker image is reused with explicit commands for:

- listing lifecycle/expiry and reservation reconciliation;
- saved-search/discovery notifications;
- durable outbound notification delivery;
- seller settlement reconciliation;
- dispute deadlines;
- return deadlines.

Keeping each worker as a separate process allows independent restart/scaling and avoids a custom in-container process supervisor.

## CI gate

Quality Gate validates the static topology, parses the Compose file, and builds all four Docker targets. P1-01 is not complete unless those container builds pass alongside the existing database, API/web, and Flutter gates.
