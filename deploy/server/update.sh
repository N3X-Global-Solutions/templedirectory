#!/usr/bin/env bash
# Deploys a new version: backs up the database, installs the release, health-checks it
# and automatically rolls back to the previous release if it does not come up.
#
#   tar xzf temple-directory-YYYYMMDD-HHMM.tar.gz
#   sudo bash temple-directory/deploy/server/update.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_root
[[ -L $APP_ROOT/current ]] || die "Temple Directory is not installed yet. Run setup.sh first."
[[ "$(readlink -f "$RELEASE_DIR")" != "$(current_release)" ]] \
  || die "Run update.sh from the newly extracted package, not from $APP_ROOT/current"
[[ -f $RELEASE_DIR/package.json && -f $RELEASE_DIR/server.js ]] || die "$RELEASE_DIR does not look like a Temple Directory package"

previous="$(current_release)"

log "Backing up the database before updating"
systemctl start temple-backup@pre-update.service || die "Pre-update backup failed — nothing was changed"
ok "Backup saved in $BACKUP_DIR"

install_release
install_systemd_units

log "Restarting with the new version"
systemctl restart temple-directory
if wait_for_health; then
  ok "Update complete — the new version is healthy"
  exit 0
fi

warn "The new version did not pass its health check. Rolling back to $(basename "$previous")"
journalctl -u temple-directory -n 30 --no-pager || true
point_current_at "$previous"
install_systemd_units
systemctl restart temple-directory
if wait_for_health; then
  die "Rolled back successfully; the site is running the previous version. Fix the error above and try again."
fi
die "Rollback also failed. Restore the pre-update backup with restore.sh (see deploy/README.md)."
