#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
WORK_DIR=${BACKUP_WORK_DIR:-/work}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
DATABASE_URL_FILE=${BACKUP_DATABASE_URL_FILE:-/run/secrets/backup_database_url}
AGE_RECIPIENT_FILE=${BACKUP_AGE_RECIPIENT_FILE:-/run/secrets/backup_age_recipient}
S3_ACCESS_KEY_FILE=${BACKUP_S3_ACCESS_KEY_FILE:-/run/secrets/backup_object_storage_access_key}
S3_SECRET_KEY_FILE=${BACKUP_S3_SECRET_KEY_FILE:-/run/secrets/backup_object_storage_secret_key}
S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-http://object-storage:9000}
S3_BUCKETS=${BACKUP_S3_BUCKETS:-}

require_file() {
  if [[ ! -r "$1" ]]; then
    echo "required secret file is not readable: $1" >&2
    exit 64
  fi
}

read_secret() {
  tr -d '\r\n' < "$1"
}

for secret_file in "$DATABASE_URL_FILE" "$AGE_RECIPIENT_FILE" "$S3_ACCESS_KEY_FILE" "$S3_SECRET_KEY_FILE"; do
  require_file "$secret_file"
done

if [[ -z "${S3_BUCKETS//[[:space:],]/}" ]]; then
  echo "BACKUP_S3_BUCKETS must contain at least one bucket" >&2
  exit 64
fi

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 || RETENTION_DAYS > 3650 )); then
  echo "BACKUP_RETENTION_DAYS must be between 1 and 3650" >&2
  exit 64
fi

DATABASE_URL=$(read_secret "$DATABASE_URL_FILE")
AGE_RECIPIENT=$(read_secret "$AGE_RECIPIENT_FILE")
S3_ACCESS_KEY=$(read_secret "$S3_ACCESS_KEY_FILE")
S3_SECRET_KEY=$(read_secret "$S3_SECRET_KEY_FILE")

if [[ -z "$DATABASE_URL" || -z "$AGE_RECIPIENT" || -z "$S3_ACCESS_KEY" || -z "$S3_SECRET_KEY" ]]; then
  echo "backup secret files must not be empty" >&2
  exit 64
fi

rclone_s3=(
  --s3-provider Minio
  --s3-endpoint "$S3_ENDPOINT"
  --s3-access-key-id "$S3_ACCESS_KEY"
  --s3-secret-access-key "$S3_SECRET_KEY"
  --s3-force-path-style
  --no-check-certificate=false
)

mkdir -p "$BACKUP_ROOT" "$WORK_DIR"
backup_id="suqnaa-$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/$backup_id"
manifest_plain="$WORK_DIR/$backup_id.manifest.tsv"
complete=0

cleanup() {
  rm -f "$manifest_plain"
  if (( complete == 0 )); then
    rm -rf "$backup_dir"
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$backup_dir/objects"
: > "$manifest_plain"

pg_dump \
  --dbname "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  | age -r "$AGE_RECIPIENT" -o "$backup_dir/database.dump.age"

IFS=',' read -r -a bucket_list <<< "$S3_BUCKETS"
object_count=0
for raw_bucket in "${bucket_list[@]}"; do
  bucket=$(printf '%s' "$raw_bucket" | xargs)
  [[ -n "$bucket" ]] || continue

  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    object_id=$(printf '%s\0%s' "$bucket" "$key" | sha256sum | awk '{print $1}')
    key_b64=$(printf '%s' "$key" | base64 -w0)

    rclone cat ":s3:${bucket}/${key}" "${rclone_s3[@]}" \
      | age -r "$AGE_RECIPIENT" -o "$backup_dir/objects/${object_id}.age"

    printf '%s\t%s\t%s\n' "$bucket" "$key_b64" "$object_id" >> "$manifest_plain"
    object_count=$((object_count + 1))
  done < <(rclone lsf --files-only -R --format p ":s3:${bucket}" "${rclone_s3[@]}")
done

age -r "$AGE_RECIPIENT" -o "$backup_dir/object-manifest.tsv.age" "$manifest_plain"
rm -f "$manifest_plain"

(
  cd "$backup_dir"
  find . -type f ! -name checksums.sha256 -print0 \
    | sort -z \
    | xargs -0 sha256sum
) > "$backup_dir/checksums.sha256"

printf '%s\n' "$backup_id" > "$backup_dir/COMPLETE"
complete=1

find "$BACKUP_ROOT" \
  -mindepth 1 -maxdepth 1 \
  -type d -name 'suqnaa-*' \
  -mtime "+$RETENTION_DAYS" \
  ! -path "$backup_dir" \
  -exec rm -rf -- {} +

printf '{"event":"backup_completed","backupId":"%s","objects":%d,"retentionDays":%d}\n' \
  "$backup_id" "$object_count" "$RETENTION_DAYS"
