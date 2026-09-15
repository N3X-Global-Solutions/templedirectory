#!/usr/bin/env bash
# Database backup: consistent SQLite snapshot → integrity check → gzip → optional off-site copy (rclone).
# Normally run by systemd as the 'temple' user:
#   sudo systemctl start temple-backup@manual      (label becomes part of the file name)
set -euo pipefail

DB_PATH=${DB_PATH:-/var/lib/temple-directory/temple-directory.db}
BACKUP_DIR=${BACKUP_DIR:-/var/lib/temple-directory/backups}
KEEP_LOCAL_DAYS=${KEEP_LOCAL_DAYS:-14}
RCLONE_REMOTE=${RCLONE_REMOTE:-}
KEEP_REMOTE_DAYS=${KEEP_REMOTE_DAYS:-60}
LABEL=${1:-manual}

fail() { echo "Backup failed: $*" >&2; exit 1; }

[[ $LABEL =~ ^[a-z0-9-]{1,30}$ ]] || fail "label must be lowercase letters, digits or dashes"
[[ -f $DB_PATH ]] || fail "database not found at $DB_PATH"
[[ $KEEP_LOCAL_DAYS =~ ^[0-9]+$ && $KEEP_REMOTE_DAYS =~ ^[0-9]+$ ]] || fail "retention days must be numbers"
mkdir -p "$BACKUP_DIR"

stamp=$(date +%Y%m%d-%H%M%S)
snapshot="$BACKUP_DIR/.in-progress-$stamp.db"
final="$BACKUP_DIR/temple-directory-$stamp-$LABEL.db.gz"
trap 'rm -f "$snapshot" "$snapshot.gz"' EXIT

# .backup uses SQLite's online backup API, so it is safe while the app is running.
sqlite3 "$DB_PATH" ".backup '$snapshot'"
integrity=$(sqlite3 "$snapshot" 'PRAGMA integrity_check;')
[[ $integrity == ok ]] || fail "integrity check reported: $integrity"
records=$(sqlite3 "$snapshot" 'SELECT COUNT(*) FROM devotees;')

gzip -9 "$snapshot"
mv "$snapshot.gz" "$final"
echo "Backup written: $final ($records devotees, $(du -h "$final" | cut -f1))"

find "$BACKUP_DIR" -maxdepth 1 -name 'temple-directory-*.db.gz' -mtime +"$KEEP_LOCAL_DAYS" -delete

if [[ -n $RCLONE_REMOTE ]]; then
  command -v rclone >/dev/null || fail "RCLONE_REMOTE is set but rclone is not installed"
  rclone copy "$final" "$RCLONE_REMOTE" --quiet
  rclone delete "$RCLONE_REMOTE" --min-age "${KEEP_REMOTE_DAYS}d" --include 'temple-directory-*.db.gz' --quiet
  echo "Copied off-site to $RCLONE_REMOTE (keeping $KEEP_REMOTE_DAYS days there)"
fi
