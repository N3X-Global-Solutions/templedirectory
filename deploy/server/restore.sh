#!/usr/bin/env bash
# Restores the database from a backup (.db.gz or .db). The current database is backed up first.
#
#   sudo bash /opt/temple-directory/current/deploy/server/restore.sh                 # list backups
#   sudo bash /opt/temple-directory/current/deploy/server/restore.sh <backup-file>
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_root
backup=${1:-}

if [[ -z $backup ]]; then
  echo "Available backups (newest first):"
  find "$BACKUP_DIR" -maxdepth 1 -name 'temple-directory-*.db.gz' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -20 | cut -d' ' -f2- | sed 's/^/  /'
  echo
  echo "Usage: sudo bash $0 <backup-file>"
  exit 0
fi
[[ -f $backup ]] || die "Backup file not found: $backup"

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
candidate="$workdir/restore.db"

log "Checking $(basename "$backup")"
case "$backup" in
  *.gz) gunzip -c "$backup" > "$candidate" ;;
  *) cp "$backup" "$candidate" ;;
esac
[[ "$(sqlite3 "$candidate" 'PRAGMA integrity_check;')" == ok ]] || die "The backup file is damaged"
devotees=$(sqlite3 "$candidate" 'SELECT COUNT(*) FROM devotees;') || die "The file is not a Temple Directory database"
ok "Backup is valid and contains $devotees devotees"

echo
read -rp "  Replace the live database with this backup? Type RESTORE to continue: " answer </dev/tty
[[ $answer == RESTORE ]] || die "Cancelled — nothing was changed"

log "Saving the current database first"
if [[ -f $DB_FILE ]]; then
  systemctl start temple-backup@pre-restore.service || die "Could not back up the current database — restore aborted"
  ok "Current data saved in $BACKUP_DIR"
fi

log "Restoring"
systemctl stop temple-directory
rm -f "$DB_FILE-wal" "$DB_FILE-shm"
install -m 0600 -o "$APP_USER" -g "$APP_USER" "$candidate" "$DB_FILE"
systemctl start temple-directory
wait_for_health || die "The app did not start after restoring. Check: journalctl -u temple-directory -n 50"
ok "Restore complete — $devotees devotees are back online"
