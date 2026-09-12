/**
 * Browser-facing hardening: the same-origin guard on unsafe `/api/*` methods,
 * the content-type requirement of the auth router's body parser, and the
 * security headers every response carries. None of these show up in a
 * `curl` walkthrough — they only matter when a BROWSER is the client, which
 * is why they get their own pinned tests.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { runMigrations } from "../src/db/migrate.ts";
import { isForeignOrigin } from "../src/middleware/originGuard.ts";
import { inlineScriptHashes } from "../src/middleware/securityHeaders.ts";
import { body, call, createUser } from "./support/harness.ts";

beforeAll(async () => {
  await runMigrations();
});

interface ErrorBody {
  error: { code: string };
}

describe("originGuard", () => {
  test("a cross-site browser request to an unsafe method is 403 before any handler runs", async () => {
    const user = await createUser("Guard");
    const response = await call("/api/auth/logout", {
      method: "POST",
      cookie: user.cookie,
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(response.status).toBe(403);
    expect((await body<ErrorBody>(response)).error.code).toBe("forbidden");
    // The session must still be alive — the forged logout did nothing.
    expect((await call("/api/auth/me", { cookie: user.cookie })).status).toBe(200);
  });

  test("a SIBLING app on the shared edge domain (same-site) is refused too", async () => {
    const response = await call("/api/auth/login", {
      method: "POST",
      body: { email: "a@toon.test", password: "irrelevant" },
      headers: { "Sec-Fetch-Site": "same-site" },
    });
    expect(response.status).toBe(403);
  });

  test("a mismatching Origin host is refused, a matching one and no Origin pass", async () => {
    const user = await createUser("Origin");
    const foreign = await call("/api/auth/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { name: "Hacked" },
      headers: { Origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);

    // `app.request()` resolves relative paths against http://localhost.
    const same = await call("/api/auth/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { name: "Renamed" },
      headers: { Origin: "https://localhost", "Sec-Fetch-Site": "same-origin" },
    });
    expect(same.status).toBe(200);

    const bare = await call("/api/auth/me", { method: "PATCH", cookie: user.cookie, body: { name: "Again" } });
    expect(bare.status).toBe(200);
  });

  test("safe methods are never checked", () => {
    const header = (name: string) => (name === "origin" ? "https://evil.example" : undefined);
    expect(isForeignOrigin({ method: "GET", url: "http://localhost/api/auth/me", header })).toBe(false);
    expect(isForeignOrigin({ method: "POST", url: "http://localhost/api/auth/me", header })).toBe(true);
    // Scheme is ignored on purpose (TLS ends at the edge proxy), the host is not.
    const https = (name: string) => (name === "origin" ? "https://localhost" : undefined);
    expect(isForeignOrigin({ method: "POST", url: "http://localhost/api/x", header: https })).toBe(false);
    const opaque = (name: string) => (name === "origin" ? "null" : undefined);
    expect(isForeignOrigin({ method: "POST", url: "http://localhost/api/x", header: opaque })).toBe(true);
  });
});

describe("auth body parsing", () => {
  test("a body that is not declared application/json is refused as bad_request", async () => {
    const { app } = await import("../src/index.ts");
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ email: "a@toon.test", password: "whatever-1234" }),
    });
    expect(response.status).toBe(400);
    expect((await body<ErrorBody>(response)).error.code).toBe("bad_request");
  });

  test("an oversized password never reaches argon2", async () => {
    const response = await call("/api/auth/login", {
      method: "POST",
      body: { email: "a@toon.test", password: "x".repeat(10_000) },
    });
    expect(response.status).toBe(422);
  });
});

describe("security headers", () => {
  test("every response carries CSP, frame denial and nosniff, but no HSTS (the edge owns it)", async () => {
    const response = await call("/api/health");
    expect(response.status).toBe(200);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toBeNull();
  });

  test("inlineScriptHashes hashes exactly the inline bodies, skipping src= scripts", () => {
    const html = `<script>var a = 1;</script><script type="module" src="/x.js"></script><script>  </script>`;
    const hashes = inlineScriptHashes(html);
    expect(hashes).toHaveLength(1);
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update("var a = 1;");
    expect(hashes[0]).toBe(`'sha256-${hasher.digest("base64")}'`);
  });
});

/* -------------------------------------------------------------------------- */
/* domain-level authorisation and bounds (security review)                    */
/* -------------------------------------------------------------------------- */

async function joinAsSecondMember(owner: { cookie: string }, householdId: string, member: { cookie: string }): Promise<void> {
  const invite = await call(`/api/households/${householdId}/invites`, { method: "POST", cookie: owner.cookie, body: {} });
  const { token } = await body<{ token: string }>(invite);
  const accept = await call("/api/households/invites/accept", { method: "POST", cookie: member.cookie, body: { token } });
  expect(accept.status).toBe(200);
}

describe("the fixed-cost plan only ever names members", () => {
  test("PATCH …/plan { payerId } and POST …/plan/incomes { personId } refuse a stranger's id", async () => {
    const { createHousehold } = await import("./support/harness.ts");
    const owner = await createUser("PlanOwner");
    const stranger = await createUser("Stranger");
    const householdId = await createHousehold(owner, "Planhaushalt");

    const payer = await call(`/api/households/${householdId}/plan`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { payerId: stranger.id },
    });
    expect(payer.status).toBe(404);

    const income = await call(`/api/households/${householdId}/plan/incomes`, {
      method: "POST",
      cookie: owner.cookie,
      body: { personId: stranger.id, amountCents: 100_000, validFrom: "2026-01" },
    });
    expect(income.status).toBe(404);
  });

  test("a period before 2000 or a range ending before it starts is 422, never a 500", async () => {
    const { createHousehold } = await import("./support/harness.ts");
    const owner = await createUser("Bounds");
    const householdId = await createHousehold(owner, "Grenzen");

    const ancient = await call(`/api/households/${householdId}/plan`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { startPeriod: "0001-01" },
    });
    expect(ancient.status).toBe(422);

    const inverted = await call(`/api/households/${householdId}/plan/items`, {
      method: "POST",
      cookie: owner.cookie,
      body: { label: "Miete", amountCents: 100, activeFrom: "2026-05", activeTo: "2026-01" },
    });
    expect(inverted.status).toBe(422);
    expect((await body<ErrorBody>(inverted)).error.code).toBe("validation_failed");
  });
});

describe("leaving a household", () => {
  test("slot 1 cannot leave while slot 2 is seated; slot 2 can, and the disabled plan follows the one who stays", async () => {
    const { createHousehold } = await import("./support/harness.ts");
    const owner = await createUser("Anchor");
    const partner = await createUser("Second");
    const householdId = await createHousehold(owner, "Verlassen");
    await joinAsSecondMember(owner, householdId, partner);

    const anchorLeaves = await call(`/api/households/${householdId}/members/${owner.id}`, { method: "DELETE", cookie: owner.cookie });
    expect(anchorLeaves.status).toBe(409);

    // Hand the (disabled) plan to the partner, then let the partner leave: the
    // plan must point back at the owner rather than at a non-member.
    expect(
      (await call(`/api/households/${householdId}/plan`, { method: "PATCH", cookie: owner.cookie, body: { payerId: partner.id } })).status,
    ).toBe(200);
    const partnerLeaves = await call(`/api/households/${householdId}/members/${partner.id}`, { method: "DELETE", cookie: partner.cookie });
    expect(partnerLeaves.status).toBe(204);
    const plan = await body<{ plan: { payerId: string } }>(await call(`/api/households/${householdId}/plan`, { cookie: owner.cookie }));
    expect(plan.plan.payerId).toBe(owner.id);

    // Ledger endpoints of the one who stayed keep working.
    expect((await call(`/api/households/${householdId}/balance`, { cookie: owner.cookie })).status).toBe(200);
  });

  test("the payer of an ENABLED plan cannot leave", async () => {
    const { createHousehold } = await import("./support/harness.ts");
    const owner = await createUser("Payer");
    const partner = await createUser("Partner");
    const householdId = await createHousehold(owner, "Aktiv");
    await joinAsSecondMember(owner, householdId, partner);
    for (const [who, amount] of [[owner, 300_000], [partner, 200_000]] as const) {
      await call(`/api/households/${householdId}/plan/incomes`, {
        method: "POST",
        cookie: owner.cookie,
        body: { personId: who.id, amountCents: amount, validFrom: "2026-01" },
      });
    }
    await call(`/api/households/${householdId}/plan/items`, {
      method: "POST",
      cookie: owner.cookie,
      body: { label: "Miete", amountCents: 100_000, activeFrom: "2026-01" },
    });
    expect(
      (await call(`/api/households/${householdId}/plan`, { method: "PATCH", cookie: owner.cookie, body: { enabled: true, payerId: partner.id } }))
        .status,
    ).toBe(200);

    const leave = await call(`/api/households/${householdId}/members/${partner.id}`, { method: "DELETE", cookie: partner.cookie });
    expect(leave.status).toBe(409);
    expect((await body<ErrorBody>(leave)).error.code).toBe("member_has_ledger");
  });
});

describe("request bounds", () => {
  test("more than 20 tags on one transaction is 422", async () => {
    const { createHousehold } = await import("./support/harness.ts");
    const owner = await createUser("Tagger");
    const householdId = await createHousehold(owner, "Tags");
    const response = await call(`/api/households/${householdId}/transactions`, {
      method: "POST",
      cookie: owner.cookie,
      body: {
        kind: "MINE_SPLIT",
        amountCents: 100,
        description: "zu viele",
        tags: Array.from({ length: 21 }, (_, index) => `t${index}`),
      },
    });
    expect(response.status).toBe(422);
  });

  test("LIKE metacharacters in ?q= match themselves, not everything", async () => {
    const { createHousehold } = await import("./support/harness.ts");
    const owner = await createUser("Searcher");
    const householdId = await createHousehold(owner, "Suche");
    for (const description of ["Brot", "100% Saft"]) {
      const created = await call(`/api/households/${householdId}/transactions`, {
        method: "POST",
        cookie: owner.cookie,
        body: { kind: "MINE_SPLIT", amountCents: 100, description },
      });
      expect(created.status).toBe(201);
    }
    const percent = await body<{ total: number }>(
      await call(`/api/households/${householdId}/transactions?q=${encodeURIComponent("%")}`, { cookie: owner.cookie }),
    );
    expect(percent.total).toBe(1);
    const underscore = await body<{ total: number }>(
      await call(`/api/households/${householdId}/transactions?q=${encodeURIComponent("_")}`, { cookie: owner.cookie }),
    );
    expect(underscore.total).toBe(0);
  });
});

describe("idempotency claims are household-scoped", () => {
  test("a settlement replay with another household's mutationId is 404, not their row", async () => {
    const { createHousehold } = await import("./support/harness.ts");
    const a = await createUser("HouseA");
    const aPartner = await createUser("HouseAPartner");
    const householdA = await createHousehold(a, "A");
    await joinAsSecondMember(a, householdA, aPartner);
    await call(`/api/households/${householdA}/transactions`, {
      method: "POST",
      cookie: a.cookie,
      body: { kind: "MINE_SPLIT", amountCents: 1000, description: "A zahlt" },
    });
    const balanceA = await body<{ balanceCents: number }>(await call(`/api/households/${householdA}/balance`, { cookie: a.cookie }));
    const mutationId = crypto.randomUUID();
    const first = await call(`/api/households/${householdA}/settlements`, {
      method: "POST",
      cookie: a.cookie,
      body: { mutationId, amountCents: 500, expectedBalanceCents: balanceA.balanceCents },
    });
    expect(first.status).toBe(201);

    const b = await createUser("HouseB");
    const bPartner = await createUser("HouseBPartner");
    const householdB = await createHousehold(b, "B");
    await joinAsSecondMember(b, householdB, bPartner);
    const replay = await call(`/api/households/${householdB}/settlements`, {
      method: "POST",
      cookie: b.cookie,
      body: { mutationId, amountCents: 500, expectedBalanceCents: 0 },
    });
    expect(replay.status).toBe(404);
  });
});
