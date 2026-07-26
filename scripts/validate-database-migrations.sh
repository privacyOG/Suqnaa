#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

migrations_dir="infra/db/migrations"
manifest_path="infra/db/migration-manifest.json"
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

  echo "Applying legacy migration $migration_file"
  psql "$database_url" --set ON_ERROR_STOP=1 --file "$migration_file"
}

if [[ -n "$base_ref" ]] && base_commit=$(git rev-parse --verify "${base_ref}^{commit}" 2>/dev/null); then
  :
else
  base_commit=$(git rev-parse --verify 'HEAD^' 2>/dev/null || true)
fi

if [[ -z "$base_commit" ]]; then
  echo "Unable to resolve a base commit for upgrade validation" >&2
  exit 1
fi

temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT

mapfile -t base_migrations < <(
  git ls-tree -r --name-only "$base_commit" -- "$migrations_dir" \
    | grep -E '\.sql$' \
    | sort
)
mapfile -t current_migrations < <(
  find "$migrations_dir" -maxdepth 1 -type f -name '*.sql' | sort
)

for migration_path in "${base_migrations[@]}"; do
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
done

reset_database "$fresh_name"
DATABASE_URL="$fresh_url" node scripts/migrate-database.mjs
DATABASE_URL="$fresh_url" node scripts/migrate-database.mjs

reset_database "$upgrade_name"
if git cat-file -e "$base_commit:scripts/migrate-database.mjs" 2>/dev/null \
  && git cat-file -e "$base_commit:$manifest_path" 2>/dev/null; then
  mkdir -p "$temporary_dir/base"
  git archive "$base_commit" \
    scripts/migrate-database.mjs \
    scripts/migration-lib.mjs \
    "$manifest_path" \
    "$migrations_dir" \
    | tar -x -C "$temporary_dir/base"

  node scripts/validate-migration-manifest-history.mjs \
    "$temporary_dir/base/$manifest_path" \
    "$manifest_path"
  DATABASE_URL="$upgrade_url" node "$temporary_dir/base/scripts/migrate-database.mjs"
else
  if [[ "${#base_migrations[@]}" -ne "${#current_migrations[@]}" ]]; then
    echo "The ledger bootstrap change cannot add or remove SQL migrations" >&2
    exit 1
  fi

  for index in "${!base_migrations[@]}"; do
    if [[ "${base_migrations[$index]}" != "${current_migrations[$index]}" ]]; then
      echo "The ledger bootstrap migration set differs from the base" >&2
      exit 1
    fi

    extracted="$temporary_dir/base_${index}.sql"
    git show "$base_commit:${base_migrations[$index]}" > "$extracted"
    apply_file "$upgrade_url" "$extracted"
  done

  DATABASE_URL="$upgrade_url" \
    MIGRATION_REFERENCE_DATABASE_URL="$fresh_url" \
    node scripts/adopt-existing-migrations.mjs
fi

DATABASE_URL="$upgrade_url" node scripts/migrate-database.mjs
DATABASE_URL="$upgrade_url" node scripts/migrate-database.mjs
MIGRATION_LEFT_DATABASE_URL="$fresh_url" \
  MIGRATION_RIGHT_DATABASE_URL="$upgrade_url" \
  node scripts/compare-database-schemas.mjs

echo "Fresh, repeat, legacy adoption, and upgrade migration validation passed."
