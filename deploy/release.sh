#!/usr/bin/env bash
set -Eeuo pipefail

compose_file=${SUQNAA_COMPOSE_FILE:-deploy/compose.production.yml}
wait_timeout=${SUQNAA_DEPLOY_WAIT_TIMEOUT_SECONDS:-120}
run_migrations=${SUQNAA_RUN_MIGRATIONS:-true}

required_images=(
  SUQNAA_API_IMAGE
  SUQNAA_WEB_IMAGE
  SUQNAA_WORKER_IMAGE
  SUQNAA_MIGRATE_IMAGE
)

for name in "${required_images[@]}"; do
  value=${!name:-}
  if [[ -z "$value" || "$value" == *:local ]]; then
    echo "$name must identify an immutable release image" >&2
    exit 64
  fi
done

compose=(docker compose -f "$compose_file")
services=(
  api
  web
  worker-listings
  worker-discovery
  worker-notifications
  worker-settlements
  worker-disputes
  worker-returns
)

"${compose[@]}" config --quiet
"${compose[@]}" pull api web worker-listings worker-discovery worker-notifications worker-settlements worker-disputes worker-returns

if [[ "$run_migrations" == "true" ]]; then
  "${compose[@]}" --profile migrate pull migrate
  "${compose[@]}" --profile migrate run --rm --no-deps migrate
elif [[ "$run_migrations" != "false" ]]; then
  echo "SUQNAA_RUN_MIGRATIONS must be true or false" >&2
  exit 64
fi

"${compose[@]}" up -d --no-build --remove-orphans --wait --wait-timeout "$wait_timeout" "${services[@]}"

"${compose[@]}" exec -T api node -e \
  "fetch('http://127.0.0.1:4000/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
"${compose[@]}" exec -T web node -e \
  "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

printf '{"event":"deployment_healthy","apiImage":"%s","webImage":"%s","workerImage":"%s"}\n' \
  "$SUQNAA_API_IMAGE" "$SUQNAA_WEB_IMAGE" "$SUQNAA_WORKER_IMAGE"
