#!/usr/bin/env bash
set -Eeuo pipefail

for name in PREVIOUS_API_IMAGE PREVIOUS_WEB_IMAGE PREVIOUS_WORKER_IMAGE PREVIOUS_MIGRATE_IMAGE; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required for rollback" >&2
    exit 64
  fi
done

export SUQNAA_API_IMAGE=$PREVIOUS_API_IMAGE
export SUQNAA_WEB_IMAGE=$PREVIOUS_WEB_IMAGE
export SUQNAA_WORKER_IMAGE=$PREVIOUS_WORKER_IMAGE
export SUQNAA_MIGRATE_IMAGE=$PREVIOUS_MIGRATE_IMAGE
export SUQNAA_RUN_MIGRATIONS=false

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec bash "$script_dir/release.sh"
