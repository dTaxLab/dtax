#!/bin/bash
set -euo pipefail
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/dtax_${TIMESTAMP}.sql.gz"
RETAIN_DAYS=30
mkdir -p "$BACKUP_DIR"
echo "[$(date)] Starting backup..."
docker compose exec -T postgres pg_dump -U dtax --clean --if-exists dtax | gzip > "$BACKUP_FILE"
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE)"
find "$BACKUP_DIR" -name "dtax_*.sql.gz" -mtime +${RETAIN_DAYS} -delete
echo "[$(date)] Cleaned backups older than ${RETAIN_DAYS} days"
