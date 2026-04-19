#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required."
  exit 1
fi

SQLITE_PATH="${DATABASE_URL#file:}"
if [ "$SQLITE_PATH" = "$DATABASE_URL" ]; then
  echo "Only SQLite DATABASE_URL values are supported by this simple VPS stack."
  exit 1
fi

if [ "${SQLITE_PATH#/}" = "$SQLITE_PATH" ]; then
  SQLITE_PATH="/app/prisma/$SQLITE_PATH"
fi

DB_WAS_MISSING="false"
if [ ! -f "$SQLITE_PATH" ]; then
  DB_WAS_MISSING="true"
fi

pnpm db:init

if [ "${SEED_DEMO_DATA:-false}" = "true" ] && [ "$DB_WAS_MISSING" = "true" ]; then
  pnpm db:seed
fi

exec pnpm start -- --hostname 0.0.0.0 --port "${PORT:-3000}"
