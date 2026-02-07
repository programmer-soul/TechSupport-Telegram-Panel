#!/bin/bash
set -e

# Wrapper entrypoint: starts PostgreSQL normally, then syncs password
# from POSTGRES_PASSWORD env var into the actual database.
# Fixes the issue where changing password in .env after first run
# causes "password authentication failed" because the volume retains
# the old password.

docker-entrypoint.sh postgres &
PG_PID=$!

trap "kill -TERM $PG_PID 2>/dev/null" TERM INT

DB_USER="${POSTGRES_USER:-postgres}"
DB_PASS="${POSTGRES_PASSWORD:-postgres}"
DB_NAME="${POSTGRES_DB:-postgres}"
DB_HOST="/var/run/postgresql"

# Wait for server socket, then ensure password is actually synced.
for i in $(seq 1 60); do
  if pg_isready -U "$DB_USER" -h "$DB_HOST" >/dev/null 2>&1; then
    # Use local socket; postgres image allows local socket auth for superuser.
    if psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
      "ALTER USER \"${DB_USER}\" WITH PASSWORD '${DB_PASS}';" >/dev/null 2>&1; then
      touch /tmp/.db_ready
      break
    fi
  fi
  sleep 1
done

# If sync failed, still mark ready so container doesn't hang,
# but backend will keep retrying until credentials are valid.
if [ ! -f /tmp/.db_ready ]; then
  touch /tmp/.db_ready
fi

wait $PG_PID
