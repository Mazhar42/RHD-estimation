#!/usr/bin/env bash
# Dumps the database to backups/rhd-ces-<label>-<UTC time>.sql.gz and deletes
# dumps older than BACKUP_KEEP_DAYS (default 14). Runs nightly from cron
# (bootstrap-vps.sh) and before every backend deploy (deploy.sh).
#
#   ./backup.sh [label]
#
# Restore (stop the backend first so nothing writes mid-restore):
#   docker compose stop backend
#   gunzip -c backups/<file>.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
#   docker compose start backend
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")"

label=${1:-daily}
[[ "$label" =~ ^[A-Za-z0-9_-]+$ ]] || {
	echo "invalid label" >&2
	exit 1
}
keep_days=$(grep -E '^BACKUP_KEEP_DAYS=' .env | tail -n1 | cut -d= -f2- || true)

umask 077
mkdir -p backups
file="backups/rhd-ces-${label}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

# --clean --if-exists makes the dump restorable over an existing database.
docker compose --env-file .env exec -T db sh -c \
	'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists' |
	gzip -9 >"$file.partial"
mv "$file.partial" "$file"

find backups -name 'rhd-ces-*.sql.gz' -mtime +"${keep_days:-14}" -delete
echo "Backup written: $file ($(du -h "$file" | cut -f1))"
