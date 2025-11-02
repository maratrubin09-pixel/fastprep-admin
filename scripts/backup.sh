#!/bin/bash

# Backup script for FastPrep Admin database
# Usage: ./scripts/backup.sh [DATABASE_URL]
# Or set DATABASE_URL environment variable

set -e

# Get DATABASE_URL from argument or environment
DATABASE_URL="${1:-$DATABASE_URL}"

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL is required"
    echo "Usage: ./scripts/backup.sh [DATABASE_URL]"
    echo "Or set DATABASE_URL environment variable"
    exit 1
fi

# Create backups directory if it doesn't exist
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp and version
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
VERSION="1.1.0"
BACKUP_FILE="$BACKUP_DIR/backup-v${VERSION}-${TIMESTAMP}.sql"

echo "📦 Creating database backup..."
echo "📁 Backup file: $BACKUP_FILE"

# Create backup using pg_dump
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Backup created successfully!"
    echo "📊 Backup size: $BACKUP_SIZE"
    echo "📁 Location: $BACKUP_FILE"
else
    echo "❌ Backup failed!"
    exit 1
fi

