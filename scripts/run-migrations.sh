#!/bin/bash
# run-migrations.sh
# Applies all migrations in the database folder sequentially via psql or Supabase CLI.

set -e

echo "Yilama Events Database Migration Runner"
echo "======================================="

# Ensure credentials are provided
if [ -z "$SUPABASE_DB_URL" ] && [ -z "$1" ]; then
    echo "Error: You must provide your Supabase PostgreSQL connection string."
    echo "Usage: ./run-migrations.sh 'postgresql://postgres:postgres@localhost:54322/postgres'"
    echo "Or set the SUPABASE_DB_URL environment variable."
    exit 1
fi

DB_URL=${SUPABASE_DB_URL:-$1}

# Create migrations table if it doesn't exist
psql "$DB_URL" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT now()
);
" > /dev/null 2>&1

echo "Checking for pending migrations..."

# Fetch applied migrations
APPLIED_MIGRATIONS=$(psql "$DB_URL" -t -A -c "SELECT filename FROM schema_migrations;")

# Loop through all SQL files sequentially in alphabetical/numerical order
cd "$(dirname "$0")/../database" || exit 1

APPLIED_COUNT=0

for file in $(ls *.sql | sort -V); do
    # Check if file is already in the database
    if echo "$APPLIED_MIGRATIONS" | grep -q "^${file}$"; then
        continue
    fi

    echo "Applying: $file"
    
    # Run the file inside a transaction
    psql "$DB_URL" -v ON_ERROR_STOP=1 -1 -f "$file"
    
    # Record the migration implementation
    psql "$DB_URL" -c "INSERT INTO schema_migrations (filename) VALUES ('$file');" > /dev/null 2>&1
    
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
done

if [ $APPLIED_COUNT -eq 0 ]; then
    echo "Database is already up to date!"
else
    echo "Successfully applied $APPLIED_COUNT migrations."
fi

exit 0
