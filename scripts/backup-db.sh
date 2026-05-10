#!/bin/bash
# Rally — Production Database Backup Script
# Run via cron: 0 2 * * * /path/to/scripts/backup-db.sh
# Supports PostgreSQL dumps to local disk and optional S3 sync

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $1"; }
log_error() { echo -e "${RED}[$(date +'%H:%M:%S')]${NC} $1"; }

# ── Configuration ──────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_CONTAINER="${DB_CONTAINER:-badminton-postgres-prod}"
DB_USER="${DB_USER:-badminton_user}"
DB_NAME="${DB_NAME:-badminton_prod}"
S3_BUCKET="${S3_BUCKET:-}"           # e.g. s3://my-backups/badminton/
COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.prod.yml}"
# ────────────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"

log_info "Starting database backup..."

# 1. Dump the database
if docker-compose -f "$COMPOSE_FILE" ps 2>/dev/null | grep -q "$DB_CONTAINER"; then
  log_info "Dumping from container $DB_CONTAINER..."
  docker-compose -f "$COMPOSE_FILE" exec -T "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
    | gzip > "$BACKUP_FILE"
else
  log_info "Container not running — trying direct pg_dump..."
  PGPASSWORD="${PGPASSWORD:-}" pg_dump \
    -h "${DB_HOST:-localhost}" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner --no-acl \
    | gzip > "$BACKUP_FILE"
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_info "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# 2. Verify the backup is not empty
if [ ! -s "$BACKUP_FILE" ]; then
  log_error "Backup file is empty — aborting."
  rm -f "$BACKUP_FILE"
  exit 1
fi

# 3. Sync to S3 (optional)
if [ -n "$S3_BUCKET" ]; then
  if command -v aws &>/dev/null; then
    log_info "Uploading to $S3_BUCKET..."
    aws s3 cp "$BACKUP_FILE" "$S3_BUCKET" --storage-class STANDARD_IA
  else
    log_warn "aws CLI not found — skipping S3 upload."
  fi
fi

# 4. Create latest symlink
ln -sf "$(basename "$BACKUP_FILE")" "$BACKUP_DIR/latest.sql.gz"

# 5. Prune old backups
DELETED=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete -print | wc -l | tr -d ' ')
if [ "$DELETED" -gt 0 ]; then
  log_info "Pruned $DELETED backup(s) older than $RETENTION_DAYS days."
fi

log_info "Backup complete. Total backups: $(find "$BACKUP_DIR" -name "backup_*.sql.gz" | wc -l | tr -d ' ')"
