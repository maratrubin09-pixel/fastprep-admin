#!/bin/bash
# Migration script for email tables
# Usage: ./run-migration.sh [DATABASE_URL]

if [ -z "$1" ]; then
  echo "Usage: $0 <DATABASE_URL>"
  echo "Example: $0 postgresql://user:pass@host:5432/dbname"
  echo ""
  echo "Or set DATABASE_URL environment variable:"
  echo "export DATABASE_URL='postgresql://...'"
  echo "$0"
  exit 1
fi

DATABASE_URL="${1:-$DATABASE_URL}"

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is required"
  exit 1
fi

echo "Running migration 004_email_tables.sql..."
psql "$DATABASE_URL" -f migrations/004_email_tables.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully!"
else
  echo "❌ Migration failed!"
  exit 1
fi

