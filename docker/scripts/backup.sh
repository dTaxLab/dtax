#!/bin/bash
set -euo pipefail
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/dtax_${TIMESTAMP}.sql.gz"
RETAIN_DAYS=30
mkdir -p "$BACKUP_DIR"
echo "[$(date)] Starting backup..."
docker compose exec -T postgres pg_dump -U dtax --clean --if-exists dtax | gzip > "$BACKUP_FILE"
# Verify the gzip file is not truncated/corrupt
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "[$(date)] ERROR: Backup file is corrupt or incomplete — removing"
  rm -f "$BACKUP_FILE"
  exit 1
fi
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE) — integrity verified"
find "$BACKUP_DIR" -name "dtax_*.sql.gz" -mtime +${RETAIN_DAYS} -delete
echo "[$(date)] Cleaned backups older than ${RETAIN_DAYS} days"
