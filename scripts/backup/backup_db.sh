#!/usr/bin/env bash
# The nightly database backup of askvalentina.co.uk (ROUND60).
#
# Runs on the server as root. Cron calls it every hour at minute 15 with
# --nightly (askvalentina-backup.cron, beside this file) and it goes on only at
# 3 o'clock UK time, so the backup is taken at 03:15 UK time all year, summer
# time included. By hand, with no argument, it backs up at once:
#     bash /root/TAROT/scripts/backup/backup_db.sh
#
# 1. pg_dump inside the postgres container, as the container's own
#    POSTGRES_USER and POSTGRES_DB (no password typed), gzipped into
#    /root/backups/tarot-backup-<UK date>-<UK time>.sql.gz. The file is checked
#    (gzip test, pg_dump's closing line) before it takes that name.
# 2. Only the newest 14 backups stay in /root/backups.
# 3. A copy goes to the private R2 bucket askvalentina-backups, under db/,
#    through the backend container, which has boto3 and the R2 keys; copies
#    older than 30 days are deleted there (TAROT-BACKEND/scripts/backup_offsite.py).
#
# Every run is written to /root/backups/backup.log and ends with one line, OK or
# FAILED, also kept on its own in /root/backups/LAST_RESULT. A failed run exits 1.
# Restoring: README.md beside this file.
set -Eeuo pipefail

TAROT_DIR="${TAROT_DIR:-/root/TAROT}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
BACKUP_BUCKET="${BACKUP_BUCKET:-askvalentina-backups}"
# UK time, summer time included (the server's tzdata).
UK_TZ="${UK_TZ:-Europe/London}"
KEEP_LOCAL=14
NIGHTLY_UK_HOUR=03
LOG="$BACKUP_DIR/backup.log"
RESULT="$BACKUP_DIR/LAST_RESULT"
DUMP_COMPLETE="-- PostgreSQL database dump complete"

if [ "${1:-}" = "--nightly" ] && [ "$(TZ="$UK_TZ" date +%H)" != "$NIGHTLY_UK_HOUR" ]; then
  exit 0
fi

# The dumps hold every client's details: only root can read them.
umask 077
mkdir -p "$BACKUP_DIR"
exec > >(tee -a "$LOG") 2>&1

stamp() { TZ="$UK_TZ" date '+%Y-%m-%d %H:%M:%S %Z'; }
partial=""
step="The backup did not start"
fail() {
  [ -n "$partial" ] && rm -f -- "$partial"
  echo "$(stamp) FAILED. $step (line $1 of backup_db.sh; the lines above say why)." | tee "$RESULT"
  exit 1
}
trap 'fail $LINENO' ERR

exec 9>"$BACKUP_DIR/.lock"
if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
  echo "$(stamp) Another backup is still running."
  false
fi

cd "$TAROT_DIR"
compose=(docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml)
name="tarot-backup-$(TZ="$UK_TZ" date +%Y-%m-%d-%H%M).sql.gz"
file="$BACKUP_DIR/$name"
partial="$file.partial"

echo "$(stamp) Backup $name starting."
step="The database dump did not complete, so no new backup was made"
"${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -9 > "$partial"
gzip -t "$partial"
ending="$(gunzip -c "$partial" | tail -n 10)"
if [[ "$ending" != *"$DUMP_COMPLETE"* ]]; then
  echo "$(stamp) The dump stopped before its end (no \"$DUMP_COMPLETE\" line)."
  false
fi
mv -- "$partial" "$file"
partial=""
echo "$(stamp) Dump written and checked: $file ($(du -h -- "$file" | cut -f1))."

printf '%s\n' "$BACKUP_DIR"/tarot-backup-*.sql.gz | sort -r | tail -n +$((KEEP_LOCAL + 1)) | while read -r old; do
  rm -f -- "$old"
  echo "$(stamp) Removed $old (only the newest $KEEP_LOCAL stay here)."
done
echo "$(stamp) Backups on this server: $(printf '%s\n' "$BACKUP_DIR"/tarot-backup-*.sql.gz | wc -l)."

echo "$(stamp) Sending a copy to the R2 bucket $BACKUP_BUCKET."
step="The copy to R2 did not complete: this backup is on this server only"
"${compose[@]}" exec -T backend python -m scripts.backup_offsite upload --bucket "$BACKUP_BUCKET" --name "$name" < "$file"

echo "$(stamp) OK $name is on this server and in R2." | tee "$RESULT"
