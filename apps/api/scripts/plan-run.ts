#!/usr/bin/env bun
/**
 * `bun run scripts/plan-run.ts [householdId]` — runs the fixed-cost catch-up
 * by hand, for ops (docs/spec.md §5.2, ledger-spec.md §4.5). The API already
 * does this at boot and every 6 hours (services/plan/scheduler.ts); this
 * exists for the rare case an operator needs it NOW, without waiting or
 * restarting the container — same `requireEnabled: false,
 * throwOnIncomplete: false` semantics as the automatic tick, so a disabled
 * plan or incomplete data is reported, never a crashing script.
 *
 * With no argument, runs every household. With one, runs only that one.
 */
import { eq } from "drizzle-orm";
import { client, db } from "../src/db/client.ts";
import { households } from "../src/db/schema.ts";
import { runCatchUp } from "../src/services/plan/accrual.service.ts";

const targetId = process.argv[2];

const rows = targetId
  ? await db.select({ id: households.id, name: households.name }).from(households).where(eq(households.id, targetId))
  : await db.select({ id: households.id, name: households.name }).from(households);

if (rows.length === 0) {
  console.error(targetId ? `[plan-run] no household ${targetId}` : "[plan-run] no households to run");
  await client.close();
  process.exit(targetId ? 1 : 0);
}

let exitCode = 0;
for (const row of rows) {
  try {
    const result = await runCatchUp(db, row.id, { trigger: "manual", requireEnabled: false, throwOnIncomplete: false });
    console.log(
      `[plan-run] ${row.name} (${row.id}): booked ${result.bookedPeriods.length} period(s), skipped ${result.skippedPeriods.length}, ${result.bookedCents} ct total`,
    );
  } catch (error) {
    exitCode = 1;
    console.error(`[plan-run] ${row.name} (${row.id}) failed:`, error instanceof Error ? error.message : error);
  }
}

await client.close();
process.exit(exitCode);
