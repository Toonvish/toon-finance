/**
 * Integration tests for /api/households: creation, reads, member rename/
 * leave, and the middleware guards (401/403/404) that back every one of
 * them. Invite-specific flows (accept, household_full on the third join)
 * live in invites.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { categories, fixedCostPlans, transactions } from "../src/db/schema.ts";
import { runMigrations } from "../src/db/migrate.ts";
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
