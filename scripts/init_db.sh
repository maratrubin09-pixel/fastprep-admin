#!/bin/bash
# Initialize database with schema and test user

# Render Postgres DATABASE_URL
# Get it from: Render Dashboard → fastprep-admin-api → Environment → DATABASE_URL
# Or from: Render Dashboard → fastprep-postgres → Connection Info

read -p "Paste DATABASE_URL from Render: " DATABASE_URL

echo "🔧 Running 001_initial_schema.sql..."
psql "$DATABASE_URL" -f ../migrations/001_initial_schema.sql

echo "🌱 Running 002_seed_test_user.sql..."
psql "$DATABASE_URL" -f ../migrations/002_seed_test_user.sql

echo "✅ Done! Test user created:"
echo "Email: admin@fastprepusa.com"
echo "Password: test123"

