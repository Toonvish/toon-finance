/**
 * Integration tests for /api/households/:householdId/plan: `plan_incomplete`
 * before the plan has data, the income-proportional share (cross-checked
 * against the `Haushalt.xlsx`-derived numbers, ledger-spec.md §4.2), the
 * monthly run's idempotency (running twice books nothing twice), catching up
 * on missed months, and the recalculate preview/apply/re-apply-is-a-no-op
 * flow. Every clock-dependent assertion pins "now" via `setClockForTest` and
 * restores it in `afterEach` (CLAUDE.md's `mock.module` gotcha: an explicit
 * setter seam, not a module mock).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { transactions } from "../src/db/schema.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { setClockForTest } from "../src/lib/clock.ts";
import { body, call, createHousehold, createUser, type TestUser } from "./support/harness.ts";

await runMigrations(db);

afterEach(() => setClockForTest(null));

interface ErrorPayload {
  error: { code: string; message: string };
}
interface PlanResponse {
  plan: { enabled: boolean; payerId: string; startPeriod: string; lastBookedPeriod: string | null };
  items: { id: string }[];
  incomes: { id: string; personId: string }[];
  current: { bookableCents: number; costTotalCents: number; incomeTotalCents: number } | null;
  pendingPeriods: string[];
}
interface RunPlanResponse {
  bookedPeriods: string[];
  skippedPeriods: string[];
  bookedCents: number;
}
interface RecalculatePlanResponse {
  items: { period: string; bookedCents: number; recomputedCents: number; deltaCents: number }[];
  totalDeltaCents: number;
  applied: boolean;
  adjustments: { id: string; origin: string; externalKey?: string }[];
}

async function joinAsSecondMember(owner: TestUser, householdId: string, member: TestUser): Promise<void> {
  const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
  const { token } = await body<{ token: string }>(invite);
  const accept = await call("/api/households/invites/accept", { method: "POST", cookie: member.cookie, body: { token } });
  expect(accept.status).toBe(200);
}

const JAN = Date.UTC(2026, 0, 15, 12); // 2026-01, well inside the month in every timezone
const FEB = Date.UTC(2026, 1, 15, 12);
const APR = Date.UTC(2026, 3, 15, 12);

/** Seeds one fixed-cost item + both incomes reproducing the exact Haushalt.xlsx numbers (ledger-spec.md §4.2). */
async function seedFullPlan(owner: TestUser, partner: TestUser, householdId: string): Promise<void> {
  await call(`/api/households/${householdId}/plan/items`, {
    method: "POST",
    cookie: owner.cookie,
    body: { label: "Fixkosten Gesamt", amountCents: 127_905, activeFrom: "2026-01" },
  });
  await call(`/api/households/${householdId}/plan/incomes`, {
    method: "POST",
    cookie: owner.cookie,
    body: { personId: owner.id, amountCents: 333_826, validFrom: "2026-01" },
  });
  await call(`/api/households/${householdId}/plan/incomes`, {
    method: "POST",
    cookie: owner.cookie,
    body: { personId: partner.id, amountCents: 204_734, validFrom: "2026-01" },
  });
  const enabled = await call(`/api/households/${householdId}/plan`, { method: "PATCH", cookie: owner.cookie, body: { enabled: true } });
  expect(enabled.status).toBe(200);
}

describe("plan_incomplete", () => {
  test("GET /plan/preview 409s before any items/incomes exist", async () => {
    setClockForTest(JAN);
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Unvollständig");

    const preview = await call(`/api/households/${householdId}/plan/preview?period=2026-01`, { cookie: owner.cookie });
    expect(preview.status).toBe(409);
    expect((await body<ErrorPayload>(preview)).error.code).toBe("plan_incomplete");
  });

  test("POST /plan/run 409s while the plan is disabled", async () => {
    setClockForTest(JAN);
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Deaktiviert");
    const run = await call(`/api/households/${householdId}/plan/run`, { method: "POST", cookie: owner.cookie, body: {} });
    expect(run.status).toBe(409);
    expect((await body<ErrorPayload>(run)).error.code).toBe("plan_disabled");
  });
});

describe("the income-proportional share", () => {
  test("matches the Haushalt.xlsx-derived figures exactly", async () => {
    setClockForTest(JAN);
    const owner = await createUser("Owner");
    const partner = await createUser("Partner");
    const householdId = await createHousehold(owner, "Anteil");
    await joinAsSecondMember(owner, householdId, partner);
    await seedFullPlan(owner, partner, householdId);

    const plan = await body<PlanResponse>(await call(`/api/households/${householdId}/plan`, { cookie: owner.cookie }));
    expect(plan.current?.costTotalCents).toBe(127_905);
    expect(plan.current?.incomeTotalCents).toBe(538_560);
    expect(plan.current?.bookableCents).toBe(48_623); // = ledger-spec.md's "share(P2)"
  });
});

describe("the monthly run — booking, idempotency, catch-up", () => {
  test("books the current period once; running again books nothing new", async () => {
    setClockForTest(JAN);
    const owner = await createUser("Owner");
    const partner = await createUser("Partner");
    const householdId = await createHousehold(owner, "Einmal buchen");
    await joinAsSecondMember(owner, householdId, partner);
    await seedFullPlan(owner, partner, householdId);

    const firstRun = await body<RunPlanResponse>(
      await call(`/api/households/${householdId}/plan/run`, { method: "POST", cookie: owner.cookie, body: {} }),
    );
    expect(firstRun.bookedPeriods).toEqual(["2026-01"]);
    expect(firstRun.bookedCents).toBe(48_623);

    const secondRun = await body<RunPlanResponse>(
      await call(`/api/households/${householdId}/plan/run`, { method: "POST", cookie: owner.cookie, body: {} }),
    );
    expect(secondRun.bookedPeriods).toEqual([]);

    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.origin, "fixed_plan")));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalKey).toBe(`fixedplan:${householdId}:2026-01`);
    expect(rows[0]?.amountCents).toBe(48_623);
    expect(rows[0]?.payerId).toBe(owner.id); // OTHER_ONLY, booked FOR the non-payer (partner)
    expect(rows[0]?.splitMode).toBe("OTHER_ONLY");
  });

  test("a container that slept through several months catches up in one run", async () => {
    setClockForTest(JAN);
    const owner = await createUser("Owner");
    const partner = await createUser("Partner");
    const householdId = await createHousehold(owner, "Nachholen");
    await joinAsSecondMember(owner, householdId, partner);
    await seedFullPlan(owner, partner, householdId);

    await call(`/api/households/${householdId}/plan/run`, { method: "POST", cookie: owner.cookie, body: {} }); // books 2026-01

    setClockForTest(APR); // three months slept through
    const catchUp = await body<RunPlanResponse>(
      await call(`/api/households/${householdId}/plan/run`, { method: "POST", cookie: owner.cookie, body: {} }),
    );
    expect(catchUp.bookedPeriods).toEqual(["2026-02", "2026-03", "2026-04"]);
    expect(catchUp.bookedCents).toBe(48_623 * 3);

    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.origin, "fixed_plan")));
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.planPeriod).sort()).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);

    const plan = await body<PlanResponse>(await call(`/api/households/${householdId}/plan`, { cookie: owner.cookie }));
    expect(plan.plan.lastBookedPeriod).toBe("2026-04");
    expect(plan.pendingPeriods).toEqual([]);

    // The catch-up never re-books what running the loop again would find already done.
    const again = await body<RunPlanResponse>(
      await call(`/api/households/${householdId}/plan/run`, { method: "POST", cookie: owner.cookie, body: {} }),
    );
    expect(again.bookedPeriods).toEqual([]);
    const rowsAfter = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.origin, "fixed_plan")));
    expect(rowsAfter).toHaveLength(4);
  });

  test("never books the future: `through` is clamped to the current period", async () => {
    setClockForTest(JAN);
    const owner = await createUser("Owner");
    const partner = await createUser("Partner");
    const householdId = await createHousehold(owner, "Nicht die Zukunft");
    await joinAsSecondMember(owner, householdId, partner);
    await seedFullPlan(owner, partner, householdId);

    const run = await body<RunPlanResponse>(
      await call(`/api/households/${householdId}/plan/run`, { method: "POST", cookie: owner.cookie, body: { through: "2026-12" } }),
    );
    expect(run.bookedPeriods).toEqual(["2026-01"]);
  });
});

describe("recalculate — booked periods are never edited", () => {
  test("preview shows the delta; apply books an adjustment; re-applying is a no-op", async () => {
    setClockForTest(JAN);
    const owner = await createUser("Owner");
    const partner = await createUser("Partner");
    const householdId = await createHousehold(owner, "Neuberechnung");
    await joinAsSecondMember(owner, householdId, partner);
    await seedFullPlan(owner, partner, householdId);
    await call(`/api/households/${householdId}/plan/run`, { method: "POST", cookie: owner.cookie, body: {} }); // books 2026-01 at 48 623

    // A retroactive raise for the payer (owner) does not touch the booked row...
    const plan = await body<PlanResponse>(await call(`/api/households/${householdId}/plan`, { cookie: owner.cookie }));
    const ownerIncome = plan.incomes.find((i) => i.personId === owner.id)!;
    await call(`/api/households/${householdId}/plan/incomes/${ownerIncome.id}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { amountCents: 400_000 },
    });

    const preview = await body<RecalculatePlanResponse>(
      await call(`/api/households/${householdId}/plan/recalculate`, { method: "POST", cookie: owner.cookie, body: { dryRun: true } }),
    );
    expect(preview.applied).toBe(false);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.period).toBe("2026-01");
    expect(preview.items[0]?.bookedCents).toBe(48_623);
    const expectedRecomputed = preview.items[0]!.recomputedCents;
    expect(preview.items[0]?.deltaCents).toBe(expectedRecomputed - 48_623);

    // ...instead it books a NEW adjustment transaction alongside it.
    const apply = await body<RecalculatePlanResponse>(
      await call(`/api/households/${householdId}/plan/recalculate`, { method: "POST", cookie: owner.cookie, body: { dryRun: false } }),
    );
    expect(apply.applied).toBe(true);
    expect(apply.adjustments).toHaveLength(1);
    expect(apply.adjustments[0]?.origin).toBe("fixed_plan_adjustment");

    const bookedRows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.origin, "fixed_plan")));
    expect(bookedRows).toHaveLength(1);
    expect(bookedRows[0]?.amountCents).toBe(48_623); // untouched

    const adjustmentRows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.origin, "fixed_plan_adjustment")));
    expect(adjustmentRows).toHaveLength(1);
    expect(adjustmentRows[0]?.externalKey).toBe(`fixedplan-adj:${householdId}:2026-01:48623`);

    // Re-applying against the SAME (unchanged since the raise) data collides on the externalKey: no new row.
    const reapply = await body<RecalculatePlanResponse>(
      await call(`/api/households/${householdId}/plan/recalculate`, { method: "POST", cookie: owner.cookie, body: { dryRun: false } }),
    );
    expect(reapply.applied).toBe(true);
    expect(reapply.adjustments).toHaveLength(0);
    const adjustmentRowsAfter = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.origin, "fixed_plan_adjustment")));
    expect(adjustmentRowsAfter).toHaveLength(1);
  });
});
