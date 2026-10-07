#!/usr/bin/env bash
# Deploys and rolls back the RHD-CES stack on this server. CI runs it after
# pushing a new image; it's just as usable by hand.
#
#   ./deploy.sh backend  <tag>        deploy that backend image (tag = git SHA)
#   ./deploy.sh frontend <tag>        deploy that frontend image
#   ./deploy.sh rollback <service>    return a service to its previous tag
#   ./deploy.sh up                    start everything at the current tags
#   ./deploy.sh status                show versions and container health
#
# A deploy pulls the image, (backend only) backs up the database, starts
# the new container and waits for its health check. If it never becomes
# healthy the previous tag is put back automatically.
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")"

log() { printf '\n==> %s\n' "$*"; }
die() {
	printf 'ERROR: %s\n' "$*" >&2
	exit 1
}

[ -f .env ] || die ".env is missing. Copy .env.example to .env and fill it in (see DEPLOYMENT.md)."
command -v docker >/dev/null || die "docker is not installed (run bootstrap-vps.sh first)."

# CI and a person at the shell may deploy at the same time.
exec 9>"./.deploy.lock"
flock -w 900 9 || die "another deploy has held the lock for 15 minutes; giving up."

compose() { docker compose --env-file .env "$@"; }

# Set by both Dockerfiles; scopes `docker image prune` to this app's images.
IMAGE_LABEL=com.rhdbridge.app=rhd-ces

get_var() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }
set_var() {
	if grep -qE "^$1=" .env; then
		sed -i "s|^$1=.*|$1=$2|" .env
	else
		printf '%s=%s\n' "$1" "$2" >>.env
	fi
}

tag_var() {
	case "$1" in
	backend) echo BACKEND_TAG ;;
	frontend) echo FRONTEND_TAG ;;
	*) die "unknown service '$1' (expected backend or frontend)" ;;
	esac
}

# Waits for the service's health check (or plain "running" if it has none).
wait_healthy() {
	local service=$1 deadline=$((SECONDS + ${2:-240})) id status
	while ((SECONDS < deadline)); do
		id=$(compose ps -q "$service" 2>/dev/null || true)
		if [ -n "$id" ]; then
			status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")
			case "$status" in
			healthy | running) return 0 ;;
			unhealthy | exited | dead) break ;;
			esac
		fi
		sleep 3
	done
	echo "---- last log lines from $service ----" >&2
	compose logs --tail=80 "$service" >&2 || true
	return 1
}

deploy() {
	local service=$1 tag=$2 var prev
	var=$(tag_var "$service")
	[[ "$tag" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || die "invalid image tag '$tag'"
	prev=$(get_var "$var")
	prev=${prev:-latest}

	log "Pulling $service:$tag"
	set_var "$var" "$tag"
	if ! compose pull --quiet "$service"; then
		set_var "$var" "$prev"
		die "could not pull $service:$tag (is the image pushed, and is this server logged in to the registry?)"
	fi

	if [ "$service" = backend ]; then
		compose up -d db
		wait_healthy db 120 || die "the database did not become healthy"
		log "Backing up the database (the new version may migrate it)"
		./backup.sh pre-deploy
	fi

	log "Starting $service:$tag"
	compose up -d --no-deps "$service"
	if ! wait_healthy "$service" 300; then
		log "$service:$tag did not become healthy; rolling back to $prev"
		set_var "$var" "$prev"
		compose up -d --no-deps "$service"
		wait_healthy "$service" 300 || true
		if [ "$service" = backend ]; then
			echo "If $tag ran a database migration, restore the pre-deploy backup in backups/ (see DEPLOYMENT.md)." >&2
		fi
		die "deploy of $service:$tag failed; now running $prev"
	fi

	[ "$prev" = "$tag" ] || set_var "PREVIOUS_$var" "$prev"
	# Unused RHD images older than a week; rollbacks further back re-pull.
	# The label filter keeps this away from other projects' images on this
	# shared server.
	docker image prune -af --filter "until=168h" --filter "label=$IMAGE_LABEL" >/dev/null || true
	log "$service is running $tag"
}

case "${1:-}" in
backend | frontend)
	[ -n "${2:-}" ] || die "usage: $0 $1 <image-tag>"
	deploy "$1" "$2"
	;;
rollback)
	var=$(tag_var "${2:-}")
	prev=$(get_var "PREVIOUS_$var")
	[ -n "$prev" ] || die "no previous $2 version recorded"
	deploy "$2" "$prev"
	;;
up)
	compose pull --quiet
	compose up -d
	for s in db backend frontend; do wait_healthy "$s" 300 || die "$s is not healthy"; done
	log "All services are up"
	;;
status)
	echo "backend:  $(get_var BACKEND_TAG)  (previous: $(get_var PREVIOUS_BACKEND_TAG))"
	echo "frontend: $(get_var FRONTEND_TAG)  (previous: $(get_var PREVIOUS_FRONTEND_TAG))"
	compose ps
	;;
*)
	sed -n '2,13p' "$0"
	exit 2
	;;
esac
