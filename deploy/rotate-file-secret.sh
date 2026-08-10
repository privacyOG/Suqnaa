#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: bash deploy/rotate-file-secret.sh <secret-name> <replacement-file>" >&2
  exit 64
fi

secret_name=$1
replacement_file=$2
secret_dir=${SUQNAA_SECRET_DIR:-./deploy/secrets}

case "$secret_name" in
  postgres_password|redis_password|queue_password|object_storage_root_user|object_storage_root_password|observability_metrics_token|grafana_admin_password|turnstile_secret_key|backup_database_url|backup_age_recipient|backup_object_storage_access_key|backup_object_storage_secret_key|backup_age_identity|restore_database_url|restore_object_storage_access_key|restore_object_storage_secret_key)
    ;;
  *)
    echo "secret name is not part of the production file-secret contract" >&2
    exit 64
    ;;
esac

if [[ ! -f "$replacement_file" || ! -r "$replacement_file" ]]; then
  echo "replacement secret file is not readable" >&2
  exit 66
fi

if [[ ! -d "$secret_dir" ]]; then
  echo "production secret directory does not exist" >&2
  exit 66
fi

target="$secret_dir/$secret_name"
temporary=$(mktemp "$secret_dir/.${secret_name}.rotate.XXXXXX")
cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT INT TERM

install -m 0600 "$replacement_file" "$temporary"
if [[ ! -s "$temporary" ]]; then
  echo "replacement secret must not be empty" >&2
  exit 65
fi

mv -f "$temporary" "$target"
trap - EXIT INT TERM

printf '{"event":"secret_file_rotated","secret":"%s"}\n' "$secret_name"
