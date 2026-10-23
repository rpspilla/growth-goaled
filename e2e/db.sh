#!/usr/bin/env bash
# Starts a throwaway local Postgres for the end-to-end run and applies migrations.
# Usage: e2e/db.sh start | stop
set -euo pipefail
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="${E2E_PGDATA:-/tmp/gg-e2e-pg}"
PORT="${E2E_PGPORT:-54329}"
# initdb refuses to run as root; use the postgres user when we are root.
as_pg() { if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

case "${1:-start}" in
  start)
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$DATA"
    mkdir -p "$DATA"
    [ "$(id -u)" = "0" ] && chown postgres "$DATA"
    as_pg "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start -w >/dev/null
    as_pg "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres gg_e2e
    DATABASE_URL_UNPOOLED="postgres://postgres@127.0.0.1:$PORT/gg_e2e" node scripts/migrate.mjs
    ;;
  stop)
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true
    ;;
esac
