#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

migrations_dir="infra/db/migrations"
base_ref="${MIGRATION_BASE_REF:-${1:-}}"
fresh_url="${MIGRATION_FRESH_DATABASE_URL:?MIGRATION_FRESH_DATABASE_URL is required}"
upgrade_url="${MIGRATION_UPGRADE_DATABASE_URL:?MIGRATION_UPGRADE_DATABASE_URL is required}"
admin_url="${MIGRATION_ADMIN_DATABASE_URL:?MIGRATION_ADMIN_DATABASE_URL is required}"
fresh_name="${MIGRATION_FRESH_DATABASE_NAME:-suqnaa_fresh}"
upgrade_name="${MIGRATION_UPGRADE_DATABASE_NAME:-suqnaa_upgrade}"

for database_name in "$fresh_name" "$upgrade_name"; do
  if [[ ! "$database_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "Unsafe database name: $database_name" >&2
    exit 1
  fi
done

reset_database() {
  local database_name="$1"

  psql "$admin_url" --set ON_ERROR_STOP=1 --set database_name="$database_name" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'database_name'
  AND pid <> pg_backend_pid();

SELECT format('DROP DATABASE IF EXISTS %I', :'database_name') \gexec
SELECT format('CREATE DATABASE %I', :'database_name') \gexec
SQL
}

apply_file() {
  local database_url="$1"
  local migration_file="$2"

  echo "Applying $migration_file"
  psql "$database_url" --set ON_ERROR_STOP=1 --file "$migration_file"
}

mapfile -d '' current_migrations < <(
  find "$migrations_dir" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z
)

if [[ "${#current_migrations[@]}" -eq 0 ]]; then
  echo "No database migrations found" >&2
  exit 1
fi

reset_database "$fresh_name"
for migration_file in "${current_migrations[@]}"; do
  apply_file "$fresh_url" "$migration_file"
done

if [[ -n "$base_ref" ]] && base_commit=$(git rev-parse --verify "${base_ref}^{commit}" 2>/dev/null); then
  :
else
  base_commit=$(git rev-parse --verify 'HEAD^' 2>/dev/null || true)
fi

if [[ -z "$base_commit" ]]; then
  echo "Unable to resolve a base commit for upgrade validation" >&2
  exit 1
fi

reset_database "$upgrade_name"
temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT

declare -A base_paths=()
mapfile -t base_migrations < <(
  git ls-tree -r --name-only "$base_commit" -- "$migrations_dir" \
    | grep -E '\.sql$' \
    | sort
)

for migration_path in "${base_migrations[@]}"; do
  base_paths["$migration_path"]=1

  if [[ ! -f "$migration_path" ]]; then
    echo "Existing migration was deleted: $migration_path" >&2
    exit 1
  fi

  base_blob=$(git rev-parse "$base_commit:$migration_path")
  head_blob=$(git hash-object "$migration_path")
  if [[ "$base_blob" != "$head_blob" ]]; then
    echo "Existing migration was modified: $migration_path" >&2
    exit 1
  fi

  extracted="$temporary_dir/${migration_path//\//_}"
  git show "$base_commit:$migration_path" > "$extracted"
  apply_file "$upgrade_url" "$extracted"
done

for migration_file in "${current_migrations[@]}"; do
  if [[ -z "${base_paths[$migration_file]+present}" ]]; then
    apply_file "$upgrade_url" "$migration_file"
  fi
done

echo "Fresh and upgrade migration validation passed."
