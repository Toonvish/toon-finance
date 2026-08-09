/**
 * The monthly run: books the non-payer's income-proportional share of the
 * fixed costs as one `OTHER_ONLY` transaction per period, strictly idempotent
 * per `(household_id, external_key)` (docs/spec.md §3.7, ledger-spec.md
 * §4.3-§4.6). Also owns `recalculate` — booked periods are immutable, so a
 * retroactive data change produces a NEW adjustment transaction, never an
 * edit of the old one.
 */
import type { RecalculatePlanResponse, RunPlanResponse, TransactionResponse } from "@toon/shared";
import { comparePeriods, computePlanForPeriod, currentPeriod, periodStartMs, periodsInclusive, serverText } from "@toon/shared";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { type AccrualRunRow, accrualRuns, fixedCostPlans, transactions } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import { nowMs } from "../../lib/clock.ts";
import { categoryIdBySlug } from "../categories/categories.service.ts";
import { loadHouseholdRow } from "../households/households.service.ts";
import { otherMemberId, slot1UserId } from "../households/members.service.ts";
import { withTransaction } from "../support.ts";
import { toTransactionResponse } from "../ledger/transactions.service.ts";
import { syncTransactionTags } from "../tags/tags.service.ts";
import { catchUpRange, isPlanComputable, periodAsMonthSlashYear } from "./period-scan.ts";
import { listIncomeRows, listItemRows, loadPlanRow, toAccrualRunResponse } from "./plan.service.ts";

/** The fixed-cost plan books into this category (docs/spec.md §2.6, §3.7). */
const PLAN_CATEGORY_SLUG = "fixkosten";

async function recordRun(
  db: Database,
  householdId: string,
  trigger: AccrualRunRow["trigger"],
  fromPeriod: string | null,
  toPeriod: string | null,
  periodsBooked: number,
  periodsSkipped: number,
  bookedCents: number,
  error: string | null,
  startedAt: number,
): Promise<AccrualRunRow> {
  const id = crypto.randomUUID();
  const finishedAt = nowMs();
  await db.insert(accrualRuns).values({
    id,
    householdId,
    trigger,
    fromPeriod,
    toPeriod,
    periodsBooked,
    periodsSkipped,
    bookedCents,
    error,
    startedAt,
    finishedAt,
  });
  return { id, householdId, trigger, fromPeriod, toPeriod, periodsBooked, periodsSkipped, bookedCents, error, startedAt, finishedAt };
}

export interface RunCatchUpOptions {
  trigger: AccrualRunRow["trigger"];
  /** Only honoured when it is BEFORE the current period — a run never books the future. */
  through?: string;
  /** `POST …/plan/run`: true (409 `plan_disabled`). Boot/interval ticks: false (silently a no-op). */
  requireEnabled: boolean;
  /** `POST …/plan/run`: true (409 `plan_incomplete` when nothing at all could be booked). Boot/interval ticks: false. */
  throwOnIncomplete: boolean;
}

export interface RunCatchUpResult {
  bookedPeriods: string[];
  skippedPeriods: string[];
  bookedCents: number;
  run: AccrualRunRow;
}

/**
 * The catch-up loop (ledger-spec.md §4.5). Booking + `lastBookedPeriod` run
 * inside ONE `withTransaction`; the `accrual_runs` audit row is written
 * AFTER that transaction settles (success OR the domain "nothing bookable"
 * case) so a `plan_incomplete` thrown to the caller never rolls back an
 * audit trail that already reflects what actually happened. A genuinely
 * unexpected failure inside the transaction still gets an audit row (`error`
 * set to the English exception message) before it is rethrown.
 */
export async function runCatchUp(db: Database, householdId: string, options: RunCatchUpOptions): Promise<RunCatchUpResult> {
  const startedAt = nowMs();
  const plan = await loadPlanRow(db, householdId);

  if (options.requireEnabled && !plan.enabled) {
    throw ApiError.conflict("plan_disabled", "server.plan.disabled");
  }
  if (!plan.enabled) {
    const run = await recordRun(db, householdId, options.trigger, null, null, 0, 0, 0, null, startedAt);
    return { bookedPeriods: [], skippedPeriods: [], bookedCents: 0, run };
  }

  const nowPeriod = currentPeriod(nowMs());
  const { from, to } = catchUpRange(plan.startPeriod, plan.lastBookedPeriod, nowPeriod, options.through);

  if (comparePeriods(from, to) > 0) {
    const run = await recordRun(db, householdId, options.trigger, null, null, 0, 0, 0, null, startedAt);
    return { bookedPeriods: [], skippedPeriods: [], bookedCents: 0, run };
  }

  const otherId = await otherMemberId(db, householdId, plan.payerId);
  const candidatePeriods = periodsInclusive(from, to);

  let outcome: { bookedPeriods: string[]; skippedPeriods: string[]; bookedCents: number; allIncomplete: boolean };
  try {
    outcome = await withTransaction(db, async (tx) => {
      if (!otherId) {
        // No second member yet — nothing can be booked as OTHER_ONLY for them.
        return { bookedPeriods: [], skippedPeriods: candidatePeriods, bookedCents: 0, allIncomplete: candidatePeriods.length > 0 };
      }

      const items = await listItemRows(tx, householdId);
      const incomeRows = await listIncomeRows(tx, householdId);
      const household = await loadHouseholdRow(tx, householdId);
      const categoryId = await categoryIdBySlug(tx, householdId, PLAN_CATEGORY_SLUG);

      const bookedPeriods: string[] = [];
      const skippedPeriods: string[] = [];
      let bookedCents = 0;
      let anyComplete = false;
      let lastBooked = plan.lastBookedPeriod;

      for (const period of candidatePeriods) {
        if (!isPlanComputable(items, incomeRows, period, plan.payerId, otherId)) {
          skippedPeriods.push(period);
          continue;
        }
        anyComplete = true;

        const computation = computePlanForPeriod({ period, items, incomes: incomeRows, payerId: plan.payerId, otherId });
        if (computation.bookableCents === 0) {
          skippedPeriods.push(period);
          continue;
        }

        const id = crypto.randomUUID();
        const timestamp = nowMs();
        const description = serverText(household.defaultLocale, {
          key: "server.content.planBookingDescription",
          values: { period: periodAsMonthSlashYear(period) },
        });
        const inserted = await tx
          .insert(transactions)
          .values({
            id,
            householdId,
            payerId: plan.payerId,
            splitMode: "OTHER_ONLY",
            amountCents: computation.bookableCents,
            description,
            categoryId,
            bookedAt: periodStartMs(period),
            dateSource: "exact",
            origin: "fixed_plan",
            planPeriod: period,
            categorySource: "system",
            importSeq: null,
            externalKey: `fixedplan:${householdId}:${period}`,
            createdBy: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoNothing({ target: [transactions.householdId, transactions.externalKey] })
          .returning({ id: transactions.id });

        if (inserted.length > 0) {
          await syncTransactionTags(tx, householdId, id, ["fixkosten", "auto"]);
          bookedPeriods.push(period);
          bookedCents += computation.bookableCents;
          lastBooked = period;
        } else {
          // Another concurrent run already booked this exact period.
          skippedPeriods.push(period);
        }
      }

      await tx.update(fixedCostPlans).set({ lastBookedPeriod: lastBooked, updatedAt: nowMs() }).where(eq(fixedCostPlans.householdId, householdId));

      return { bookedPeriods, skippedPeriods, bookedCents, allIncomplete: !anyComplete && skippedPeriods.length > 0 };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordRun(db, householdId, options.trigger, from, to, 0, 0, 0, message, startedAt);
    throw error;
  }

  const run = await recordRun(
    db,
    householdId,
    options.trigger,
    from,
    to,
    outcome.bookedPeriods.length,
    outcome.skippedPeriods.length,
    outcome.bookedCents,
    null,
    startedAt,
  );

  if (options.throwOnIncomplete && outcome.bookedPeriods.length === 0 && outcome.allIncomplete) {
    throw ApiError.conflict("plan_incomplete", "server.plan.incomplete");
  }

  return { bookedPeriods: outcome.bookedPeriods, skippedPeriods: outcome.skippedPeriods, bookedCents: outcome.bookedCents, run };
}

/** `POST …/plan/run`. */
export async function runPlanNow(db: Database, householdId: string, through?: string): Promise<RunPlanResponse> {
  const result = await runCatchUp(db, householdId, { trigger: "manual", through, requireEnabled: true, throwOnIncomplete: true });
  return {
    bookedPeriods: result.bookedPeriods,
    skippedPeriods: result.skippedPeriods,
    bookedCents: result.bookedCents,
    run: toAccrualRunResponse(result.run),
  };
}

interface RecalculationLine {
  period: string;
  bookedCents: number;
  recomputedCents: number;
  deltaCents: number;
}

/**
 * `POST …/plan/recalculate` (ledger-spec.md §4.6). Every already-booked
 * `fixed_plan` period is recomputed against TODAY's items/incomes; a
 * difference produces a preview line, and — unless `dryRun` — a NEW
 * `fixed_plan_adjustment` transaction (never an edit of the booked row).
 * `externalKey` encodes the superseded amount, so re-running against
 * unchanged data collides (no-op) while a second correction gets its own key.
 */
export async function recalculatePlan(db: Database, householdId: string, viewerId: string, dryRun: boolean): Promise<RecalculatePlanResponse> {
  const plan = await loadPlanRow(db, householdId);
  if (!plan.enabled) throw ApiError.conflict("plan_disabled", "server.plan.disabled");

  const otherId = await otherMemberId(db, householdId, plan.payerId);
  const items = await listItemRows(db, householdId);
  const incomeRows = await listIncomeRows(db, householdId);

  const bookedRows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.origin, "fixed_plan")));

  const lines: RecalculationLine[] = [];
  if (otherId) {
    for (const row of bookedRows) {
      if (!row.planPeriod) continue;
      if (!isPlanComputable(items, incomeRows, row.planPeriod, plan.payerId, otherId)) continue;
      const computation = computePlanForPeriod({ period: row.planPeriod, items, incomes: incomeRows, payerId: plan.payerId, otherId });
      const delta = computation.bookableCents - row.amountCents;
      if (delta !== 0) {
        lines.push({ period: row.planPeriod, bookedCents: row.amountCents, recomputedCents: computation.bookableCents, deltaCents: delta });
      }
    }
  }
  lines.sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
  const totalDeltaCents = lines.reduce((sum, line) => sum + line.deltaCents, 0);

  if (dryRun || lines.length === 0) {
    return { items: lines, totalDeltaCents, applied: false, adjustments: [] };
  }

  const adjustments: TransactionResponse[] = await withTransaction(db, async (tx) => {
    const household = await loadHouseholdRow(tx, householdId);
    const categoryId = await categoryIdBySlug(tx, householdId, PLAN_CATEGORY_SLUG);
    const person1Id = await slot1UserId(tx, householdId);
    const created: TransactionResponse[] = [];

    for (const line of lines) {
      const id = crypto.randomUUID();
      const timestamp = nowMs();
      const description = serverText(household.defaultLocale, {
        key: "server.content.planAdjustmentDescription",
        values: { period: periodAsMonthSlashYear(line.period) },
      });
      const inserted = await tx
        .insert(transactions)
        .values({
          id,
          householdId,
          payerId: plan.payerId,
          splitMode: "OTHER_ONLY",
          amountCents: line.deltaCents,
          description,
          categoryId,
          bookedAt: timestamp,
          dateSource: "exact",
          origin: "fixed_plan_adjustment",
          planPeriod: line.period,
          categorySource: "system",
          importSeq: null,
          externalKey: `fixedplan-adj:${householdId}:${line.period}:${line.bookedCents}`,
          createdBy: viewerId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing({ target: [transactions.householdId, transactions.externalKey] })
        .returning({ id: transactions.id });

      if (inserted.length === 0) continue; // re-run against unchanged data: already applied
      await syncTransactionTags(tx, householdId, id, ["fixkosten", "korrektur"]);
      const rows = await tx.select().from(transactions).where(eq(transactions.id, id)).limit(1);
      created.push(await toTransactionResponse(tx, rows[0]!, person1Id));
    }
    return created;
  });

  return { items: lines, totalDeltaCents, applied: true, adjustments };
}
