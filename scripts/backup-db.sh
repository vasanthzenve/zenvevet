#!/bin/bash
# ==============================================================================
# Zenve Vet Automated Database Backup Script
# Performs compressed MySQL dump with SHA-256 checksums and 30-day retention
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups/mysql}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-zenvevet}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-REDACTED_DB_PWD}"
RETENTION_DAYS=30

mkdir -p "${BACKUP_DIR}"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_backup_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

echo "=== [$(date)] Starting Automated MySQL Backup for ${DB_NAME} ==="

mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"

sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "=== [$(date)] Backup Completed Successfully: ${BACKUP_FILE} (${FILE_SIZE}) ==="

# Retention: Delete backups older than 30 days
find "${BACKUP_DIR}" -type f -name "${DB_NAME}_backup_*.sql.gz*" -mtime +"${RETENTION_DAYS}" -delete
echo "=== [$(date)] Purged backups older than ${RETENTION_DAYS} days ==="

