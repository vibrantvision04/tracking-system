#!/bin/bash
# Simple script to run migrations using psql
# Usage: ./setup_db.sh "postgres://user:pass@localhost:5432/dbname"

DB_URL=$1
if [ -z "$DB_URL" ]; then
    echo "Usage: ./setup_db.sh <database_url>"
    exit 1
fi

echo "Running migrations..."
psql "$DB_URL" -f migrations/001_initial_schema.sql
psql "$DB_URL" -f migrations/002_timescale_setup.sql
psql "$DB_URL" -f migrations/003_trips_reports.sql
psql "$DB_URL" -f migrations/004_geofences.sql
psql "$DB_URL" -f migrations/005_indexes.sql
echo "Migrations completed."
