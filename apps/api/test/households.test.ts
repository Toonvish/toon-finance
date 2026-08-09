/**
 * Integration tests for /api/households: creation, reads, member rename/
 * leave, and the middleware guards (401/403/404) that back every one of
 * them. Invite-specific flows (accept, household_full on the third join)
 * live in invites.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { categories, fixedCostPlans, householdMembers, transactions } from "../src/db/schema.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { ApiError } from "../src/lib/errors.ts";
import { isUniqueViolation } from "../src/services/auth/users.service.ts";
import { assignSlot } from "../src/services/households/members.service.ts";
import { body, call, createHousehold, createUser } from "./support/harness.ts";

await runMigrations(db);

interface ErrorPayload {
  error: { code: string; message: string };
}
interface HouseholdResponse {
  id: string;
  name: string;
  defaultLocale: string;
  memberCount: number;
}
interface HouseholdDetail {
  household: HouseholdResponse;
  members: { userId: string; memberSlot: number; displayName: string }[];
  viewerSlot: number;
}

describe("POST /api/households", () => {
  test("seats the caller in slot 1 and seeds 21 categories + a disabled plan row", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Testhaushalt");

    const seededCategories = await db.select().from(categories).where(eq(categories.householdId, householdId));
    expect(seededCategories).toHaveLength(21);
    expect(seededCategories.filter((row) => row.isSystem)).toHaveLength(1);
    expect(seededCategories.find((row) => row.slug === "fixkosten")?.isSystem).toBe(true);

    const [plan] = await db.select().from(fixedCostPlans).where(eq(fixedCostPlans.householdId, householdId));
    expect(plan?.enabled).toBe(false);
    expect(plan?.payerId).toBe(owner.id);
  });
});

describe("GET /api/households/:householdId", () => {
  test("401 without a session, 403 for a non-member, 404 for an unknown id", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Privat");
    const stranger = await createUser("Stranger");

    expect((await call(`/api/households/${householdId}`)).status).toBe(401);
    expect((await call(`/api/households/${householdId}`, { cookie: stranger.cookie })).status).toBe(403);
    expect((await call("/api/households/does-not-exist", { cookie: owner.cookie })).status).toBe(404);
  });

  test("returns the household, its members, and the viewer's own slot", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Mit Mitgliedern");

    const response = await call(`/api/households/${householdId}`, { cookie: owner.cookie });
    expect(response.status).toBe(200);
    const payload = await body<HouseholdDetail>(response);
    expect(payload.household.memberCount).toBe(1);
    expect(payload.viewerSlot).toBe(1);
    expect(payload.members).toHaveLength(1);
    expect(payload.members[0]?.userId).toBe(owner.id);
  });
});

describe("PATCH /api/households/:householdId", () => {
  test("renames the household", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Alter Name");

    const response = await call(`/api/households/${householdId}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { name: "Neuer Name" },
    });
    expect(response.status).toBe(200);
    expect((await body<HouseholdResponse>(response)).name).toBe("Neuer Name");
  });
});

describe("PATCH /api/households/:householdId/members/:userId", () => {
  test("lets a member rename only themself", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Umbenennen");

    const own = await call(`/api/households/${householdId}/members/${owner.id}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { displayName: "Neuer Anzeigename" },
    });
    expect(own.status).toBe(200);

    const other = await call(`/api/households/${householdId}/members/not-my-id`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { displayName: "Fremd" },
    });
    expect(other.status).toBe(403);
  });
});

describe("DELETE /api/households/:householdId/members/:userId", () => {
  test("lets a member leave, but refuses while a ledger entry still names them as payer", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Verlassen");

    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      householdId,
      payerId: owner.id,
      splitMode: "SPLIT_EQUAL",
      amountCents: 1000,
      description: "Testbuchung",
      bookedAt: Date.now(),
      dateSource: "exact",
      origin: "manual",
      categorySource: "manual",
    });

    const blocked = await call(`/api/households/${householdId}/members/${owner.id}`, { method: "DELETE", cookie: owner.cookie });
    expect(blocked.status).toBe(409);
    expect((await body<ErrorPayload>(blocked)).error.code).toBe("member_has_ledger");

    await db.delete(transactions).where(eq(transactions.householdId, householdId));

    const allowed = await call(`/api/households/${householdId}/members/${owner.id}`, { method: "DELETE", cookie: owner.cookie });
    expect(allowed.status).toBe(204);
  });
});

describe("the two-person rule is enforced by the DB, not by the read before it", () => {
  test("two accepts racing for the last free slot: one wins, the other gets 409 household_full", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Wettlauf");
    const first = await createUser("First");
    const second = await createUser("Second");

    // `assignSlot` reads the occupied slots and THEN inserts; both of these see
    // slot 2 free, and only `household_members_slot_uidx` separates them.
    const results = await Promise.allSettled([
      assignSlot(db, householdId, first.id, "First"),
      assignSlot(db, householdId, second.id, "Second"),
    ]);
    const seated = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(seated).toHaveLength(1);
    expect(refused).toHaveLength(1);

    // The loser must lose the way the contract says — not as a raw SQLite
    // error escaping the service as a 500.
    const reason = (refused[0] as PromiseRejectedResult).reason as ApiError;
    expect(reason).toBeInstanceOf(ApiError);
    expect(reason.status).toBe(409);
    expect(reason.code).toBe("household_full");

    const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    expect(members).toHaveLength(2);
  });

  test("isUniqueViolation sees through the wrapper drizzle puts around every query error", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Wrapper");
    let caught: unknown;
    try {
      // Slot 1 is already the owner's.
      await db.insert(householdMembers).values({
        householdId,
        userId: owner.id,
        memberSlot: 1,
        displayName: "Doppelt",
        joinedAt: Date.now(),
      });
    } catch (error) {
      caught = error;
    }
    // The thrown object is a `DrizzleQueryError` reading "Failed query: insert
    // into …" — the words "UNIQUE constraint failed" only appear in `.cause`.
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toMatch(/unique constraint/i);
    expect(isUniqueViolation(caught)).toBe(true);
  });
});
