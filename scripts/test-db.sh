#!/usr/bin/env bash
# Runs the RLS tests against a throwaway local Postgres (needs initdb/pg_ctl/psql on PATH).
# Usage: scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="$(mktemp -d /tmp/altaris-pg.XXXXXX)"
PORT=54329
trap 'pg_ctl -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

initdb -D "$DIR" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR" -o "-p $PORT -k ''" -l "$DIR/log" -w start >/dev/null

p() { psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
p -d postgres -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do p -d postgres -f "$f"; done
p -d postgres -f supabase/seed.sql

OUT="$(p -d postgres -f supabase/tests/rls.sql | grep -v '^$')"
echo "$OUT"
! grep -q '^FAIL' <<<"$OUT"
