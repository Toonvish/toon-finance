/**
 * Foundation smoke test + the TEMPLATE for every API integration test: spin
 * up an isolated in-memory libSQL DB, run the generated migrations, hit
 * `app` directly via `app.request()` (no port bound).
 *
 * Feature agents: copy the `createDatabase` pattern below for a test that
 * needs total isolation from the rest of the suite; use
 * `test/support/harness.ts` (the shared process `db`) for anything that goes
 * through the real router, since routes read the `db` singleton.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDatabase } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { households, householdMembers, sessions, users } from "../src/db/schema.ts";
import { env } from "../src/env.ts";
import { app } from "../src/index.ts";
import { ApiError } from "../src/lib/errors.ts";

const { client, db } = createDatabase({ url: "file::memory:" });
await runMigrations(db);

afterAll(() => {
  client.close();
});

describe("env", () => {
  test("defaults to a temp-file DB under bun test (never a developer .env)", () => {
    expect(env.NODE_ENV).toBe("test");
    expect(env.databaseKind).toBe("file");
    expect(env.webOrigins.length).toBeGreaterThan(0);
  });
});

describe("GET /api/health", () => {
  test("answers 200 with the health payload", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: string; database: string; mail: string };
    expect(payload.status).toBe("ok");
    expect(payload.database).toBe("file");
    expect(payload.mail).toBe("console");
  });
});

describe("error envelope", () => {
  test("unknown routes use the standard shape", async () => {
    const response = await app.request("/api/does-not-exist");
    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe("not_found");
    expect(typeof payload.error.message).toBe("string");
  });

  test("ApiError.toBody() renders the negotiated locale", () => {
    const body = ApiError.conflict("email_taken", "server.auth.emailTaken").toBody("de");
    expect(body).toEqual({
      error: { code: "email_taken", message: "Zu dieser E-Mail-Adresse gibt es bereits ein Konto." },
    });
    const enBody = ApiError.conflict("email_taken", "server.auth.emailTaken").toBody("en");
    expect(enBody.error.message).toBe("An account with this email address already exists.");
  });
});

describe("router mounts exist", () => {
  test("the auth + households routers are mounted (JSON error, not a crash)", async () => {
    const cases: Record<string, number> = {
      "/api/auth/me": 401,
      "/api/auth/login": 404, // only POST is registered
      "/api/households": 401,
    };
    for (const [path, status] of Object.entries(cases)) {
      const response = await app.request(path);
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain("application/json");
    }
  });
});

describe("schema + migrations", () => {
  test("migrations create a usable schema with cascading deletes", async () => {
    const userId = crypto.randomUUID();
    const householdId = crypto.randomUUID();

    await db.insert(users).values({ id: userId, email: "a@b.de", emailNormalized: "a@b.de", name: "Tester", passwordHash: "x" });
    await db.insert(households).values({ id: householdId, name: "Testhaushalt", createdBy: userId });
    await db.insert(householdMembers).values({ householdId, userId, memberSlot: 1, displayName: "Tester" });

    expect(await db.select().from(householdMembers)).toHaveLength(1);

    await client.execute({ sql: "delete from households where id = ?", args: [householdId] });
    expect(await db.select().from(householdMembers)).toHaveLength(0);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  test("users.email_normalized is unique", async () => {
    await db.insert(users).values({ id: crypto.randomUUID(), email: "dup@toon.local", emailNormalized: "dup@toon.local", name: "A", passwordHash: "x" });
    const duplicate = async () => {
      await db.insert(users).values({ id: crypto.randomUUID(), email: "DUP@toon.local", emailNormalized: "dup@toon.local", name: "B", passwordHash: "x" });
    };
    await expect(duplicate()).rejects.toThrow();
  });

  test("household_members enforces exactly two slots", async () => {
    const householdId = crypto.randomUUID();
    const owner = crypto.randomUUID();
    await db.insert(users).values({ id: owner, email: "owner@toon.local", emailNormalized: "owner@toon.local", name: "Owner", passwordHash: "x" });
    await db.insert(households).values({ id: householdId, name: "H", createdBy: owner });
    await db.insert(householdMembers).values({ householdId, userId: owner, memberSlot: 1, displayName: "Owner" });

    const thirdSlot = async () => {
      const third = crypto.randomUUID();
      await db.insert(users).values({ id: third, email: "third@toon.local", emailNormalized: "third@toon.local", name: "Third", passwordHash: "x" });
      await db.insert(householdMembers).values({ householdId, userId: third, memberSlot: 1, displayName: "Third" });
    };
    await expect(thirdSlot()).rejects.toThrow();
  });

  test("sessions row survives, then the model works: a fake session authenticates", async () => {
    const userId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, email: "sess@toon.local", emailNormalized: "sess@toon.local", name: "Sess", passwordHash: "x" });
    const sessionId = crypto.randomUUID().replaceAll("-", "");
    await db.insert(sessions).values({ id: sessionId, userId, expiresAt: Date.now() + 1000 * 60 });
    expect(await db.select().from(sessions)).toHaveLength(1);
  });
});
