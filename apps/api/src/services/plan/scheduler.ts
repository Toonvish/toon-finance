/**
 * Triggers the fixed-cost catch-up WITHOUT a cron dependency (docs/spec.md
 * §3.7): once at API boot — after migrations, before the server accepts
 * traffic — and then every 6 hours. Both paths funnel through the same
 * `runCatchUp`, so a boot run and an interval tick can never disagree about
 * what "already booked" means; the unique index on `external_key` makes a
 * second, overlapping tick a safe no-op even if one is still in flight.
 *
 * Never started under `bun test` (src/index.ts gates both calls on
 * `!env.isTest`) — a repeating timer would keep the test process alive past
 * its last assertion.
 */
import { db } from "../../db/client.ts";
import { households } from "../../db/schema.ts";
import { runCatchUp } from "./accrual.service.ts";

const INTERVAL_MS = 6 * 60 * 60 * 1000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runForEveryHousehold(trigger: "boot" | "interval"): Promise<void> {
  const rows = await db.select({ id: households.id }).from(households);
  for (const row of rows) {
    try {
      // requireEnabled/throwOnIncomplete: false — an automatic tick is not a
      // user action; a disabled plan or incomplete data is simply "nothing to
      // do", recorded in accrual_runs, never a rejected request.
      await runCatchUp(db, row.id, { trigger, requireEnabled: false, throwOnIncomplete: false });
    } catch (error) {
      // A genuinely unexpected failure (already recorded in accrual_runs by
      // runCatchUp itself) must not take the whole boot sequence down, and
      // must not stop the OTHER households in this loop from getting their run.
      console.error(`[plan] catch-up failed for household ${row.id}:`, error);
    }
  }
}

/** Awaited by src/index.ts before the server starts accepting traffic. */
export async function runBootCatchUp(): Promise<void> {
  await runForEveryHousehold("boot");
}

/** Starts the repeating 6-hour tick. Idempotent — a second call is a no-op. */
export function startAccrualScheduler(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    void runForEveryHousehold("interval");
  }, INTERVAL_MS);
  // Node/Bun-only: never keep the process alive JUST for this timer.
  (intervalHandle as unknown as { unref?: () => void }).unref?.();
}

/** Stops the tick — tests only (there is no repeating timer to stop in prod short of process exit). */
export function stopAccrualScheduler(): void {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}
