#!/usr/bin/env bash
# Shared helpers for setup.sh, update.sh and restore.sh. Source this file; do not run it.

# These paths are used by the scripts that source this file.
# shellcheck disable=SC2034
APP_USER="temple"
APP_ROOT="/opt/temple-directory"
DATA_DIR="/var/lib/temple-directory"
BACKUP_DIR="$DATA_DIR/backups"
CONFIG_DIR="/etc/temple-directory"
ENV_FILE="$CONFIG_DIR/temple.env"
FIRST_RUN_ENV="$CONFIG_DIR/first-run.env"
BACKUP_ENV="$CONFIG_DIR/backup.env"
DUCKDNS_ENV="$CONFIG_DIR/duckdns.env"
TUNNEL_ENV="/etc/cloudflared/temple-tunnel.env"
DB_FILE="$DATA_DIR/temple-directory.db"
HEALTH_URL="http://127.0.0.1:3000/api/health"
KEEP_RELEASES=3
HEALTH_WAIT_SECONDS=45

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

log()  { printf '\n\033[1;33m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[1;35m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

require_root() {
  [[ $EUID -eq 0 ]] || die "Please run with sudo, e.g.: sudo bash $0"
}

# Runs sqlite3 as the app user so WAL/SHM side files are never created with root ownership.
db_query() {
  runuser -u "$APP_USER" -- sqlite3 "$DB_FILE" "$1"
}

wait_for_health() {
  local seconds=${1:-$HEALTH_WAIT_SECONDS}
  for ((i = 0; i < seconds; i++)); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

current_release() {
  readlink -f "$APP_ROOT/current" 2>/dev/null || true
}

point_current_at() {
  ln -sfn "$1" "$APP_ROOT/current.tmp"
  mv -Tf "$APP_ROOT/current.tmp" "$APP_ROOT/current"
}

prune_releases() {
  local keep_current
  keep_current="$(current_release)"
  find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -rn | tail -n +$((KEEP_RELEASES + 1)) | cut -d' ' -f2- \
    | while read -r dir; do
        [[ "$(readlink -f "$dir")" == "$keep_current" ]] || rm -rf "$dir"
      done
}

# Copies the extracted package into a new timestamped release, installs production
# dependencies and atomically switches the "current" symlink to it.
install_release() {
  local version target
  version="$(date +%Y%m%d-%H%M%S)"
  target="$APP_ROOT/releases/$version"

  log "Installing application release $version"
  install -d -m 0755 "$target"
  cp -a "$RELEASE_DIR/." "$target/"
  rm -rf "$target/node_modules" "$target/data" "$target/.env" "$target/dist" "$target/coverage"
  (cd "$target" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --no-update-notifier --loglevel=error >/dev/null)
  chown -R root:root "$target"
  chmod -R u=rwX,go=rX "$target"
  point_current_at "$target"
  prune_releases
  ok "Release $version is live at $APP_ROOT/current"
}

install_systemd_units() {
  local unit
  for unit in temple-directory.service temple-backup@.service temple-backup.timer \
              temple-duckdns.service temple-duckdns.timer temple-cloudflared.service; do
    install -m 0644 "$SCRIPT_DIR/systemd/$unit" "/etc/systemd/system/$unit"
  done
  systemctl daemon-reload
}
