#!/bin/bash
# ==============================================================================
# Zenve Vet Database Restore & Disaster Recovery Script
# Verifies SHA-256 integrity and restores compressed MySQL dump
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-zenvevet}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-REDACTED_DB_PWD}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file ${BACKUP_FILE} not found!"
  exit 1
fi

echo "=== [$(date)] Starting Database Restore for ${DB_NAME} ==="

if [ -f "${CHECKSUM_FILE}" ]; then
  echo "Verifying SHA-256 checksum..."
  sha256sum -c "${CHECKSUM_FILE}"
  echo "Checksum verified!"
else
  echo "Warning: No checksum file found. Proceeding with caution..."
fi

echo "Restoring database from ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  "${DB_NAME}"

echo "=== [$(date)] Database Restore Completed Successfully! ==="

