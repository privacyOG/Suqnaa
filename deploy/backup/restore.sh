#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
WORK_DIR=${BACKUP_WORK_DIR:-/work}
RESTORE_ENVIRONMENT=${RESTORE_ENVIRONMENT:-staging}
DATABASE_URL_FILE=${RESTORE_DATABASE_URL_FILE:-/run/secrets/restore_database_url}
AGE_IDENTITY_FILE=${RESTORE_AGE_IDENTITY_FILE:-/run/secrets/backup_age_identity}
S3_ACCESS_KEY_FILE=${RESTORE_S3_ACCESS_KEY_FILE:-/run/secrets/restore_object_storage_access_key}
S3_SECRET_KEY_FILE=${RESTORE_S3_SECRET_KEY_FILE:-/run/secrets/restore_object_storage_secret_key}
S3_ENDPOINT=${RESTORE_S3_ENDPOINT:-http://object-storage:9000}
CLEAR_OBJECT_STORAGE=${RESTORE_CLEAR_OBJECT_STORAGE:-true}

if [[ "$RESTORE_ENVIRONMENT" != "staging" && "${ALLOW_PRODUCTION_RESTORE:-}" != "I_UNDERSTAND_THIS_DESTROYS_DATA" ]]; then
  echo "restore is restricted to staging unless ALLOW_PRODUCTION_RESTORE is explicitly acknowledged" >&2
  exit 64
fi

read_secret() {
  tr -d '\r\n' < "$1"
}

for secret_file in "$DATABASE_URL_FILE" "$AGE_IDENTITY_FILE" "$S3_ACCESS_KEY_FILE" "$S3_SECRET_KEY_FILE"; do
  if [[ ! -r "$secret_file" ]]; then
    echo "required restore secret file is not readable: $secret_file" >&2
    exit 64
  fi
done

DATABASE_URL=$(read_secret "$DATABASE_URL_FILE")
S3_ACCESS_KEY=$(read_secret "$S3_ACCESS_KEY_FILE")
S3_SECRET_KEY=$(read_secret "$S3_SECRET_KEY_FILE")

rclone_s3=(
  --s3-provider Minio
  --s3-endpoint "$S3_ENDPOINT"
  --s3-access-key-id "$S3_ACCESS_KEY"
  --s3-secret-access-key "$S3_SECRET_KEY"
  --s3-force-path-style
  --no-check-certificate=false
)

if [[ -n "${BACKUP_ID:-}" ]]; then
  backup_dir="$BACKUP_ROOT/$BACKUP_ID"
else
  backup_dir=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'suqnaa-*' -exec test -f '{}/COMPLETE' ';' -print \
    | sort \
    | tail -n 1)
fi

if [[ -z "${backup_dir:-}" || ! -d "$backup_dir" || ! -f "$backup_dir/COMPLETE" ]]; then
  echo "no complete backup set found" >&2
  exit 66
fi

backup_id=$(basename "$backup_dir")
manifest_plain="$WORK_DIR/$backup_id.restore-manifest.tsv"
mkdir -p "$WORK_DIR"
trap 'rm -f "$manifest_plain"' EXIT INT TERM

(
  cd "$backup_dir"
  sha256sum -c checksums.sha256
)

age --decrypt -i "$AGE_IDENTITY_FILE" \
  -o "$manifest_plain" \
  "$backup_dir/object-manifest.tsv.age"

age --decrypt -i "$AGE_IDENTITY_FILE" "$backup_dir/database.dump.age" \
  | pg_restore \
      --dbname "$DATABASE_URL" \
      --clean \
      --if-exists \
      --no-owner \
      --no-acl \
      --exit-on-error

mapfile -t buckets < <(cut -f1 "$manifest_plain" | sort -u)
if [[ "$CLEAR_OBJECT_STORAGE" == "true" ]]; then
  for bucket in "${buckets[@]}"; do
    [[ -n "$bucket" ]] || continue
    rclone delete ":s3:${bucket}" "${rclone_s3[@]}" || true
  done
fi

restored_objects=0
while IFS=$'\t' read -r bucket key_b64 object_id; do
  [[ -n "$bucket" && -n "$key_b64" && -n "$object_id" ]] || continue
  key=$(printf '%s' "$key_b64" | base64 -d)
  encrypted_object="$backup_dir/objects/${object_id}.age"
  if [[ ! -f "$encrypted_object" ]]; then
    echo "encrypted object is missing: $object_id" >&2
    exit 65
  fi

  rclone mkdir ":s3:${bucket}" "${rclone_s3[@]}"
  age --decrypt -i "$AGE_IDENTITY_FILE" "$encrypted_object" \
    | rclone rcat ":s3:${bucket}/${key}" "${rclone_s3[@]}"
  restored_objects=$((restored_objects + 1))
done < "$manifest_plain"

migration_count=$(psql "$DATABASE_URL" -Atqc "select count(*) from schema_migrations" 2>/dev/null || true)
if [[ ! "$migration_count" =~ ^[0-9]+$ ]] || (( migration_count < 1 )); then
  echo "database restore verification failed: migration ledger unavailable" >&2
  exit 65
fi

expected_objects=$(awk 'NF >= 3 { count += 1 } END { print count + 0 }' "$manifest_plain")
if (( restored_objects != expected_objects )); then
  echo "object restore verification failed: expected $expected_objects restored $restored_objects" >&2
  exit 65
fi

printf '{"event":"restore_drill_completed","environment":"%s","backupId":"%s","migrations":%d,"objects":%d}\n' \
  "$RESTORE_ENVIRONMENT" "$backup_id" "$migration_count" "$restored_objects"
