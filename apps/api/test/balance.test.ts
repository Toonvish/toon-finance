/**
 * Integration tests for /api/households/:householdId/balance: the sign
 * convention (positive = slot 2 owes slot 1), the viewer-relative negation,
 * the breakdown sub-totals, and the `sammelbuchung` exclusion toggle.
 */
import { describe, expect, test } from "bun:test";
import { db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { body, call, createHousehold, createUser, type TestUser } from "./support/harness.ts";

await runMigrations(db);

interface BalanceResponse {
  balanceCents: number;
  perspectiveUserId: string;
  viewerUserId: string;
  viewerBalanceCents: number;
  breakdown: { splitOtherCents: number; forOtherCents: number; settledCents: number; transactionCount: number };
}

async function joinAsSecondMember(owner: TestUser, householdId: string, member: TestUser): Promise<void> {
  const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
  const { token } = await body<{ token: string }>(invite);
  const accept = await call("/api/households/invites/accept", { method: "POST", cookie: member.cookie, body: { token } });
  expect(accept.status).toBe(200);
}

describe("GET /api/households/:householdId/balance", () => {
  test("computes the balance from every kind, and negates for a slot-2 viewer", async () => {
    const owner = await createUser("Owner");
    const partner = await createUser("Partner");
    const householdId = await createHousehold(owner, "Saldo");
    await joinAsSecondMember(owner, householdId, partner);

    // owner (slot 1) pays 10 001 split -> +5 000 for slot 1.
    await call(`/api/households/${householdId}/transactions`, {
      method: "POST",
      cookie: owner.cookie,
      body: { kind: "MINE_SPLIT", amountCents: 10_001, description: "Ich" },
    });
    // partner (slot 2) pays 10 001 split -> -5 000 for slot 1.
    await call(`/api/households/${householdId}/transactions`, {
      method: "POST",
      cookie: owner.cookie,
      body: { kind: "THEIRS_SPLIT", amountCents: 10_001, description: "Partner" },
    });
    // owner pays 2 000 fully for partner -> +2 000 for slot 1.
    await call(`/api/households/${householdId}/transactions`, {
      method: "POST",
      cookie: owner.cookie,
      body: { kind: "FOR_THEM", amountCents: 2_000, description: "Für Partner" },
    });
    // partner transfers 1 000 to owner -> -1 000 for slot 1.
    await call(`/api/households/${householdId}/transactions`, {
      method: "POST",
      cookie: owner.cookie,
      body: { kind: "TRANSFER", amountCents: 1_000, description: "Ausgleich" },
    });

    const expected = 5_000 - 5_000 + 2_000 - 1_000; // = 1 000

    const asOwner = await body<BalanceResponse>(await call(`/api/households/${householdId}/balance`, { cookie: owner.cookie }));
    expect(asOwner.balanceCents).toBe(expected);
    expect(asOwner.viewerBalanceCents).toBe(expected);
    expect(asOwner.perspectiveUserId).toBe(owner.id);
    expect(asOwner.breakdown.transactionCount).toBe(4);
    expect(asOwner.breakdown.splitOtherCents).toBe(0);
    expect(asOwner.breakdown.forOtherCents).toBe(2_000);
    expect(asOwner.breakdown.settledCents).toBe(-1_000);

    const asPartner = await body<BalanceResponse>(await call(`/api/households/${householdId}/balance`, { cookie: partner.cookie }));
    expect(asPartner.balanceCents).toBe(expected); // slot-1-perspective figure is unchanged
    expect(asPartner.viewerBalanceCents).toBe(-expected); // negated for the slot-2 viewer
  });

  test("includeAggregates=false excludes rows tagged sammelbuchung", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Ausschluss");

    await call(`/api/households/${householdId}/transactions`, {
      method: "POST",
      cookie: owner.cookie,
      body: { kind: "FOR_THEM", amountCents: 4_458_891, description: "Sammelüberweisung", tags: ["sammelbuchung"] },
    });
    await call(`/api/households/${householdId}/transactions`, {
      method: "POST",
      cookie: owner.cookie,
      body: { kind: "FOR_THEM", amountCents: 500, description: "Normal" },
    });

    const withAggregates = await body<BalanceResponse>(await call(`/api/households/${householdId}/balance`, { cookie: owner.cookie }));
    expect(withAggregates.balanceCents).toBe(4_458_891 + 500);

    const without = await body<BalanceResponse>(
      await call(`/api/households/${householdId}/balance?includeAggregates=false`, { cookie: owner.cookie }),
    );
    expect(without.balanceCents).toBe(500);
  });
});
