#!/usr/bin/env bun
/**
 * `bun run seed` — a demo household for local development: two accounts
 * ("Eric" / "Sandy"), seated in slots 1 and 2 of one household, with the
 * default categories and a (disabled) fixed-cost-plan row already seeded by
 * `createHousehold`. Idempotent: re-running it against an existing DB with
 * the same seed accounts is a no-op, not a duplicate-email crash.
 *
 * NOT run automatically — `docker/entrypoint.sh` only runs migrations. This
 * is a developer convenience, invoked by hand.
 */
import { client, db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { hashPassword } from "../src/services/auth/passwords.ts";
import { createUser, findUserByEmail } from "../src/services/auth/users.service.ts";
import { createHousehold } from "../src/services/households/households.service.ts";
import { assignSlot } from "../src/services/households/members.service.ts";

const SEED_PASSWORD = "seed-password-change-me";

async function ensureUser(email: string, name: string): Promise<{ id: string; created: boolean }> {
  const existing = await findUserByEmail(db, email);
  if (existing) return { id: existing.id, created: false };
  const passwordHash = await hashPassword(SEED_PASSWORD);
  const row = await createUser(db, { email, name, passwordHash });
  return { id: row.id, created: true };
}

await runMigrations();

const eric = await ensureUser("eric@toon.local", "Eric");
const sandy = await ensureUser("sandy@toon.local", "Sandy");

if (eric.created) {
  const householdId = await createHousehold(db, eric.id, { name: "Unser Haushalt", displayName: "Eric" });
  await assignSlot(db, householdId, sandy.id, "Sandy");
  console.log(`[seed] created household ${householdId} with Eric (slot 1) + Sandy (slot 2)`);
  console.log(`[seed] sign in as eric@toon.local / sandy@toon.local, password: ${SEED_PASSWORD}`);
} else {
  console.log("[seed] eric@toon.local already exists — nothing to do");
}

await client.close();
