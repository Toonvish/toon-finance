#!/usr/bin/env bun
/**
 * `bun run db:migrate` — applies every pending migration to whatever
 * DATABASE_URL points at (a local file, or Turso). Also what
 * `docker/entrypoint.sh` runs before the API starts (`set -eu`: a failed
 * migration must stop the container, not start it against a half-migrated
 * schema).
 */
import { client } from "../src/db/client.ts";
import { env } from "../src/env.ts";
import { runMigrations } from "../src/db/migrate.ts";

console.log(`[migrate] applying migrations to ${env.databaseKind === "remote" ? "remote database" : env.databaseUrl}`);
await runMigrations();
console.log("[migrate] done");
await client.close();
