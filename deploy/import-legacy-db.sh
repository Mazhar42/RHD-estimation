#!/usr/bin/env bash
# One-time: copies the data of the old, hand-built deployment (compose
# project "backend" in /opt/rhd-ces/backend, served at rhdbridge.com) into
# this stack, replacing whatever this stack's database holds. The old
# database is only read, never changed.
#
#   ./import-legacy-db.sh --rehearse   copy while the old app keeps running
#                                      (to check the import works; data
#                                      entered afterwards is not copied)
#   ./import-legacy-db.sh              the real cutover: stops the old
#                                      backend first so nothing changes
#                                      mid-copy, and leaves it stopped
#
# After the copy the new backend starts and migrates the data to the current
# schema. If anything fails, the old backend is started again.
#
# The single-quoted "$POSTGRES_USER"/"$POSTGRES_DB" are meant to expand
# inside the database containers, not here.
# shellcheck disable=SC2016
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")"

OLD_DB=${OLD_DB:-rhd-estimation-db-prod}
OLD_BACKEND=${OLD_BACKEND:-rhd-estimation-backend-prod}

log() { printf '\n==> %s\n' "$*"; }
die() {
	printf 'ERROR: %s\n' "$*" >&2
	exit 1
}
compose() { docker compose --env-file .env "$@"; }

rehearse=false
case "${1:-}" in
--rehearse) rehearse=true ;;
"") ;;
*) die "usage: $0 [--rehearse]" ;;
esac

[ -f .env ] || die ".env is missing; deploy this stack first (DEPLOYMENT.md)."
docker inspect "$OLD_DB" >/dev/null 2>&1 || die "old database container '$OLD_DB' not found."
[ -n "$(compose ps -q db 2>/dev/null)" ] || die "this stack is not running yet; deploy it first."

exec 9>"./.deploy.lock"
flock -w 900 9 || die "a deploy is in progress; try again later."

old_stopped=false
finished=false
restore_old() {
	if ! $finished && $old_stopped; then
		echo "Import failed; starting the old backend again." >&2
		docker start "$OLD_BACKEND" >/dev/null || true
	fi
}
trap restore_old EXIT

umask 077
mkdir -p backups
dump="backups/rhd-ces-legacy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

if ! $rehearse; then
	log "Stopping the old backend ($OLD_BACKEND) so nothing changes during the copy"
	docker stop "$OLD_BACKEND" >/dev/null
	old_stopped=true
fi

log "Dumping the old database to $dump"
# --no-owner/--no-privileges: the old and new stacks use different database
# users; everything is re-created owned by this stack's user.
docker exec "$OLD_DB" sh -c \
	'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' |
	gzip -9 >"$dump.partial"
mv "$dump.partial" "$dump"

log "Backing up this stack's current database first"
./backup.sh pre-import

log "Replacing this stack's database with the dump"
compose stop backend
compose exec -T db sh -c \
	'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
gunzip -c "$dump" |
	compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null

log "Starting the backend (it migrates the data to the current schema)"
compose start backend
deadline=$((SECONDS + 300))
while :; do
	status=$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q backend)")
	[ "$status" = healthy ] && break
	if [ "$status" = unhealthy ] || ((SECONDS > deadline)); then
		compose logs --tail=80 backend >&2
		die "the backend did not become healthy after the import (log above). The old app is untouched."
	fi
	sleep 3
done

finished=true
log "Import complete"
compose exec -T db sh -c \
	'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT '\''users: '\'' || count(*) FROM users"'
if $rehearse; then
	echo "Rehearsal only: the old app is still running. Run without --rehearse at cutover."
else
	echo "The old backend ($OLD_BACKEND) is stopped. Its database is untouched; see DEPLOYMENT.md to retire it."
fi
