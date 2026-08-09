#!/bin/sh
# =============================================================================
# Container entrypoint: make the data volume usable, then hand over to the API.
#
# Everything here is idempotent — it runs on every start, including a restart
# after a crash and a `docker compose up` on an existing volume.
# =============================================================================
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"

log() { printf '[entrypoint] %s\n' "$*"; }

mkdir -p "$DATA_DIR"

# --- schema ------------------------------------------------------------------
# Migrations are applied on every boot. They are the only writer of the schema,
# so a fresh volume gets a working ledger DB with no manual step, and an
# upgraded image applies its new migrations before it starts answering
# requests.
#
# A FAILED MIGRATION MUST STOP THE CONTAINER. Starting the API against a
# half-migrated database would answer requests with confusing 500s instead,
# and the healthcheck would report the container as fine.
if [ "${SKIP_MIGRATIONS:-}" = "1" ]; then
  log "SKIP_MIGRATIONS=1 — skipping migrations"
else
  log "applying database migrations"
  bun apps/api/scripts/migrate.ts
fi

log "starting: $*"
exec "$@"
