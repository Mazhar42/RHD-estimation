#!/usr/bin/env bash
# One-time preparation of an Ubuntu 22.04 / 24.04 server for RHD-CES.
# Run as root; safe to run again. (Already done on the current VPS.)
#
#   sudo bash bootstrap-vps.sh
#
# It installs Docker if missing, creates the `deploy` user that CI logs in
# as, adds swap on small machines, and schedules the nightly backup and the
# hourly purge of expired works.
#
# The server is shared with other apps, so this deliberately leaves the
# firewall, nginx, TLS and system-wide packages alone. The nginx site file
# is installed by hand (DEPLOYMENT.md).
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/opt/rhd-ces}
DEPLOY_USER=${DEPLOY_USER:-deploy}

[ "$(id -u)" -eq 0 ] || {
	echo "Run as root (sudo bash $0)." >&2
	exit 1
}

echo "==> Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl

echo "==> Docker"
if ! command -v docker >/dev/null; then
	# Docker's official installer (adds its apt repository).
	curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker compose version

echo "==> Deploy user '$DEPLOY_USER'"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
	adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
# Docker group = root-equivalent on this host; the user has no password and
# logs in only with the CI key.
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

echo "==> App directory $APP_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/backups"

if ! swapon --show | grep -q .; then
	echo "==> 2 GB swap"
	fallocate -l 2G /swapfile
	chmod 600 /swapfile
	mkswap /swapfile
	swapon /swapfile
	grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> Scheduled jobs (/etc/cron.d/rhd-ces)"
cat >/etc/cron.d/rhd-ces <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Nightly database backup (02:30 server time), kept BACKUP_KEEP_DAYS days.
30 2 * * * $DEPLOY_USER [ -f $APP_DIR/.env ] && $APP_DIR/backup.sh daily >>$APP_DIR/backups/backup.log 2>&1
# Hourly: archive works past their retention period.
5 * * * * $DEPLOY_USER [ -f $APP_DIR/.env ] && cd $APP_DIR && docker compose exec -T backend python scripts/purge.py >>$APP_DIR/backups/purge.log 2>&1
EOF
chmod 644 /etc/cron.d/rhd-ces

cat <<EOF

Done. Next steps (details in DEPLOYMENT.md):
  1. Put the CI public key in /home/$DEPLOY_USER/.ssh/authorized_keys
  2. As $DEPLOY_USER, create $APP_DIR/.env from .env.example (chmod 600)
  3. Push to main (or run the Deploy workflow)
  4. Install the nginx site file and get its certificate
  5. Import the old database, or create the first admin:
       cd $APP_DIR && docker compose exec backend python -m app.cli create-admin
EOF
