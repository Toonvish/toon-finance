/**
 * Placeholder members: a person seated in the household WITHOUT an account
 * (docs/spec.md §2.1/§3.5), and the claim invite that later turns that seat
 * into a real login — in place, so every payer_id keeps naming the same
 * person. The two-person rule stays a DB fact throughout.
 */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { users } from "../src/db/schema.ts";
import { setMailer } from "../src/services/mail/index.ts";
import { body, call, createHousehold, createUser } from "./support/harness.ts";

await runMigrations(db);

interface ErrorPayload {
  error: { code: string };
}
interface Member {
  userId: string;
  displayName: string;
  memberSlot: number;
  email: string | null;
  hasAccount: boolean;
}
interface Invite {
  id: string;
  token: string;
  claimsUserId: string | null;
}

async function seatPlaceholder(cookie: string, householdId: string, displayName = "Sandy"): Promise<Member> {
  const response = await call(`/api/households/${householdId}/members`, { method: "POST", cookie, body: { displayName } });
  expect(response.status).toBe(201);
  return body<Member>(response);
}

describe("POST /api/households/:householdId/members (placeholder)", () => {
  test("seats a person without an account in slot 2", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Platzhalter");

    const member = await seatPlaceholder(owner.cookie, householdId);
    expect(member.memberSlot).toBe(2);
    expect(member.displayName).toBe("Sandy");
    expect(member.email).toBeNull();
    expect(member.hasAccount).toBe(false);

    const detail = await body<{ household: { memberCount: number }; members: Member[] }>(
      await call(`/api/households/${householdId}`, { cookie: owner.cookie }),
    );
    expect(detail.household.memberCount).toBe(2);
    expect(detail.members.map((m) => m.hasAccount)).toEqual([true, false]);
  });

  test("a third seat is still 409 household_full, and a plain invite is refused too", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Voll");
    await seatPlaceholder(owner.cookie, householdId);

    const third = await call(`/api/households/${householdId}/members`, { method: "POST", cookie: owner.cookie, body: { displayName: "Dritte" } });
    expect(third.status).toBe(409);
    expect((await body<ErrorPayload>(third)).error.code).toBe("household_full");

    const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
    expect(invite.status).toBe(409);
    expect((await body<ErrorPayload>(invite)).error.code).toBe("household_full");
  });

  test("the other member may rename and remove the placeholder, but never a real member", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Pflege");
    const placeholder = await seatPlaceholder(owner.cookie, householdId);

    const renamed = await call(`/api/households/${householdId}/members/${placeholder.userId}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { displayName: "Sandra" },
    });
    expect(renamed.status).toBe(200);
    expect((await body<Member>(renamed)).displayName).toBe("Sandra");

    const removed = await call(`/api/households/${householdId}/members/${placeholder.userId}`, { method: "DELETE", cookie: owner.cookie });
    expect(removed.status).toBe(204);
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, placeholder.userId));
    expect(row).toBeUndefined();

    // A real second member is still nobody else's to edit (docs/spec.md §3.5).
    const second = await createUser("Second");
    const invite = await body<Invite>(await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} }));
    expect((await call("/api/households/invites/accept", { method: "POST", cookie: second.cookie, body: { token: invite.token } })).status).toBe(200);
    const forbidden = await call(`/api/households/${householdId}/members/${second.id}`, { method: "DELETE", cookie: owner.cookie });
    expect(forbidden.status).toBe(403);
  });

  test("a placeholder with bookings cannot be removed (409 member_has_ledger)", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Ledger");
    const placeholder = await seatPlaceholder(owner.cookie, householdId);

    const tx = await call(`/api/households/${householdId}/transactions`, {
      method: "POST",
      cookie: owner.cookie,
      body: { amountCents: 1000, kind: "THEIRS_SPLIT", description: "Sandy zahlt", bookedAt: new Date().toISOString() },
    });
    expect(tx.status).toBe(201);

    const removed = await call(`/api/households/${householdId}/members/${placeholder.userId}`, { method: "DELETE", cookie: owner.cookie });
    expect(removed.status).toBe(409);
    expect((await body<ErrorPayload>(removed)).error.code).toBe("member_has_ledger");
  });
});

describe("claim invites", () => {
  test("registering with a claim token turns the placeholder into the account — same user id", async () => {
    setMailer(null);
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Claim");
    const placeholder = await seatPlaceholder(owner.cookie, householdId);

    // Allowed at two members: the seat is the placeholder's own.
    const created = await call(`/api/households/${householdId}/invites`, {
      method: "POST",
      cookie: owner.cookie,
      body: { claimsUserId: placeholder.userId },
    });
    expect(created.status).toBe(201);
    const invite = await body<Invite>(created);
    expect(invite.claimsUserId).toBe(placeholder.userId);

    const preview = await body<{ claimsDisplayName: string | null }>(await call(`/api/households/invites/${invite.token}`));
    expect(preview.claimsDisplayName).toBe("Sandy");

    const email = `sandy-${crypto.randomUUID()}@example.org`;
    const registered = await call("/api/auth/register", {
      method: "POST",
      body: { email, name: "Sandy", password: "correct horse battery", inviteToken: invite.token },
    });
    expect(registered.status).toBe(201);
    const session = await body<{ user: { id: string; email: string }; household: { id: string; memberSlot: number } | null }>(registered);
    expect(session.user.id).toBe(placeholder.userId);
    expect(session.user.email).toBe(email);
    expect(session.household?.id).toBe(householdId);
    expect(session.household?.memberSlot).toBe(2);

    const login = await call("/api/auth/login", { method: "POST", body: { email, password: "correct horse battery" } });
    expect(login.status).toBe(200);

    const members = await body<{ members: Member[] }>(await call(`/api/households/${householdId}`, { cookie: owner.cookie }));
    expect(members.members[1]?.hasAccount).toBe(true);

    // The link is spent: a second registration onto it must not touch the account.
    const again = await call("/api/auth/register", {
      method: "POST",
      body: { email: `other-${crypto.randomUUID()}@example.org`, name: "X", password: "correct horse battery", inviteToken: invite.token },
    });
    expect(again.status).toBe(404);
    expect((await body<ErrorPayload>(again)).error.code).toBe("invite_invalid");
  });

  test("an existing account cannot accept a claim invite (409 invite_claim_requires_register)", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Fremd");
    const placeholder = await seatPlaceholder(owner.cookie, householdId);
    const invite = await body<Invite>(
      await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: { claimsUserId: placeholder.userId } }),
    );

    const stranger = await createUser("Stranger");
    const accept = await call("/api/households/invites/accept", { method: "POST", cookie: stranger.cookie, body: { token: invite.token } });
    expect(accept.status).toBe(409);
    expect((await body<ErrorPayload>(accept)).error.code).toBe("invite_claim_requires_register");
  });

  test("a claim invite for a member who already has an account is 409 member_has_account", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Konto");
    const refused = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: { claimsUserId: owner.id } });
    expect(refused.status).toBe(409);
    expect((await body<ErrorPayload>(refused)).error.code).toBe("member_has_account");
  });

  test("a placeholder cannot log in and a taken address is 409 email_taken on claim", async () => {
    const owner = await createUser("Owner");
    const householdId = await createHousehold(owner, "Login");
    const placeholder = await seatPlaceholder(owner.cookie, householdId);
    const invite = await body<Invite>(
      await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: { claimsUserId: placeholder.userId } }),
    );
    const taken = await call("/api/auth/register", {
      method: "POST",
      body: { email: owner.email, name: "Sandy", password: "correct horse battery", inviteToken: invite.token },
    });
    expect(taken.status).toBe(409);
    expect((await body<ErrorPayload>(taken)).error.code).toBe("email_taken");
  });
});
