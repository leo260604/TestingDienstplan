#!/bin/sh
set -e
# Datenbankschema vor dem Start aktualisieren (abschaltbar mit SKIP_MIGRATIONS=1)
if [ "${SKIP_MIGRATIONS:-0}" != "1" ] && [ -n "$DATABASE_URL" ]; then
  echo "Prisma: migrate deploy …"
  (cd /app/migrate && node node_modules/prisma/build/index.js migrate deploy) || {
    echo "Migration fehlgeschlagen" >&2; exit 1; }
fi
exec "$@"
