/**
 * Integration tests for invites: creation, the public preview, accepting
 * (idempotently), and — the hard product rule (docs/spec.md §1.2 #1/#4) —
 * that a household never seats a third member, whether that is refused at
 * invite-creation time or at accept time.
 */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { invites } from "../src/db/schema.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { setMailer } from "../src/services/mail/index.ts";
import { body, call, createHousehold, createUser } from "./support/harness.ts";

await runMigrations(db);

interface ErrorPayload {
  error: { code: string; message: string };
}
interface InviteResponse {
  id: string;
  token: string;
  inviteUrl: string;
  status: string;
  mailDelivery: string;
}
interface AcceptResponse {
  household: { id: string; memberCount: number };
  memberSlot: number;
  alreadyMember: boolean;
}

describe("POST /api/households/:householdId/invites", () => {
  test("mints a token, and a second call revokes the first", async () => {
    setMailer(null);
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Einladen");

    const first = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    expect(first.status).toBe(201);
    const firstInvite = await body<InviteResponse>(first);
    expect(firstInvite.inviteUrl).toContain(firstInvite.token);
    expect(firstInvite.mailDelivery).toBe("not_configured");

    const second = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    expect(second.status).toBe(201);

    const [firstRow] = await db.select().from(invites).where(eq(invites.id, firstInvite.id));
    expect(firstRow?.status).toBe("revoked");
  });

  test("refuses to mint an invite once the household already has two members", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Voll");
    const second = await createUser("Second");

    const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    const { token } = await body<InviteResponse>(invite);
    const accept = await call("/api/households/invites/accept", { method: "POST", cookie: second.cookie, body: { token } });
    expect(accept.status).toBe(200);

    const blocked = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    expect(blocked.status).toBe(409);
    expect((await body<ErrorPayload>(blocked)).error.code).toBe("household_full");
  });
});

describe("GET /api/households/invites/:token", () => {
  test("public preview works without a session", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Vorschau");
    const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    const { token } = await body<InviteResponse>(invite);

    const preview = await call(`/api/households/invites/${token}`);
    expect(preview.status).toBe(200);
    const payload = await body<{ householdName: string; invitedByName: string }>(preview);
    expect(payload.householdName).toBe("Vorschau");
    expect(payload.invitedByName).toBe("Owner");
  });

  test("an unknown token is invite_invalid", async () => {
    const response = await call("/api/households/invites/not-a-real-token");
    expect(response.status).toBe(404);
    expect((await body<ErrorPayload>(response)).error.code).toBe("invite_invalid");
  });
});

describe("POST /api/households/invites/accept", () => {
  test("seats the invitee in the free slot, idempotently", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Beitreten");
    const invitee = await createUser("Invitee");

    const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    const { token } = await body<InviteResponse>(invite);

    const accept = await call("/api/households/invites/accept", { method: "POST", cookie: invitee.cookie, body: { token } });
    expect(accept.status).toBe(200);
    const payload = await body<AcceptResponse>(accept);
    expect(payload.memberSlot).toBe(2);
    expect(payload.alreadyMember).toBe(false);
    expect(payload.household.memberCount).toBe(2);

    // Accepting again (replay) is idempotent, not a downgrade or an error.
    const again = await call("/api/households/invites/accept", { method: "POST", cookie: invitee.cookie, body: { token } });
    expect(again.status).toBe(200);
    const againPayload = await body<AcceptResponse>(again);
    expect(againPayload.alreadyMember).toBe(true);
    expect(againPayload.memberSlot).toBe(2);
  });

  test("rejects a THIRD member even for a token minted before the household filled up", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Schon voll");
    const second = await createUser("Second");
    const third = await createUser("Third");

    const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    const { token: firstToken } = await body<InviteResponse>(invite);
    await call("/api/households/invites/accept", { method: "POST", cookie: second.cookie, body: { token: firstToken } });

    // Simulate a still-pending invite existing despite the household being
    // full (createInvite() itself refuses this, so insert directly — the
    // guarantee this test protects is in acceptInvite(), not just at issue time).
    const staleToken = crypto.randomUUID();
    await db.insert(invites).values({
      id: crypto.randomUUID(),
      householdId,
      token: staleToken,
      invitedBy: owner.id,
      status: "pending",
      expiresAt: Date.now() + 60_000,
    });

    const response = await call("/api/households/invites/accept", { method: "POST", cookie: third.cookie, body: { token: staleToken } });
    expect(response.status).toBe(409);
    expect((await body<ErrorPayload>(response)).error.code).toBe("household_full");
  });
});

describe("DELETE /api/households/:householdId/invites/:inviteId", () => {
  test("revokes a pending invite", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Widerrufen");
    const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    const { id } = await body<InviteResponse>(invite);

    const revoke = await call(`/api/households/${householdId}/invites/${id}`, { method: "DELETE", cookie: owner.cookie });
    expect(revoke.status).toBe(204);

    const [row] = await db.select().from(invites).where(eq(invites.id, id));
    expect(row?.status).toBe("revoked");
  });
});
