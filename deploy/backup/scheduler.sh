#!/usr/bin/env bash
set -Eeuo pipefail

INTERVAL_SECONDS=${BACKUP_INTERVAL_SECONDS:-86400}
STARTUP_DELAY_SECONDS=${BACKUP_STARTUP_DELAY_SECONDS:-30}

if ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || (( INTERVAL_SECONDS < 3600 )); then
  echo "BACKUP_INTERVAL_SECONDS must be an integer of at least 3600" >&2
  exit 64
fi
if ! [[ "$STARTUP_DELAY_SECONDS" =~ ^[0-9]+$ ]] || (( STARTUP_DELAY_SECONDS < 0 || STARTUP_DELAY_SECONDS > 3600 )); then
  echo "BACKUP_STARTUP_DELAY_SECONDS must be between 0 and 3600" >&2
  exit 64
fi

stopping=0
trap 'stopping=1' INT TERM

sleep "$STARTUP_DELAY_SECONDS" &
wait $! || true

while (( stopping == 0 )); do
  started=$(date -u +%FT%TZ)
  if /opt/suqnaa-backup/backup.sh; then
    printf '{"event":"scheduled_backup_success","startedAt":"%s"}\n' "$started"
  else
    status=$?
    printf '{"event":"scheduled_backup_failure","startedAt":"%s","exitCode":%d}\n' "$started" "$status" >&2
  fi

  (( stopping == 0 )) || break
  sleep "$INTERVAL_SECONDS" &
  wait $! || true
done
