/**
 * Integration tests for /api/auth: register, login, logout, profile,
 * password change/forgot/reset, sessions. Runs against the shared process DB
 * (env forces a real temp-file DATABASE_URL under `NODE_ENV=test` — see
 * env.ts's `defaultTestDatabaseUrl`), so the register/accept-invite
 * transactions really commit, not just degrade to sequential statements.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { setMailer } from "../src/services/mail/index.ts";
import { resetRateLimits } from "../src/services/auth/rateLimit.ts";
import { body, call, type TestUser } from "./support/harness.ts";

await runMigrations(db);

afterEach(() => {
  setMailer(null);
  resetRateLimits();
});

interface AuthPayload {
  user: { id: string; email: string; name: string; locale: string };
  household: { id: string; memberSlot: number; memberCount: number } | null;
}
interface ErrorPayload {
  error: { code: string; message: string };
}

function uniqueEmail(tag: string): string {
  return `${tag}.${crypto.randomUUID().slice(0, 8)}@toon.test`;
}

interface RegisterResult {
  user: TestUser;
  status: number;
  cookie: string;
  payload: AuthPayload & Partial<ErrorPayload>;
}

async function register(email: string, name: string, password = "correct-horse-battery"): Promise<RegisterResult> {
  const response = await call("/api/auth/register", {
    method: "POST",
    body: { email, name, password },
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const payload = await body<AuthPayload & Partial<ErrorPayload>>(response);
  return { user: { id: payload.user?.id ?? "", email, name, cookie }, status: response.status, cookie, payload };
}

describe("POST /api/auth/register", () => {
  test("creates the account, an own household in slot 1, and signs in", async () => {
    const email = uniqueEmail("register");
    const { status, cookie, payload } = await register(email, "Neu");
    expect(status).toBe(201);
    expect(cookie).toContain("toon_session=");
    expect(payload.user.email).toBe(email);
    expect(payload.household).not.toBeNull();
    expect(payload.household?.memberSlot).toBe(1);
    expect(payload.household?.memberCount).toBe(1);
  });

  test("rejects a second registration with the same address", async () => {
    const email = uniqueEmail("dup");
    await register(email, "Erste");
    const { status, payload } = await register(email, "Zweite");
    expect(status).toBe(409);
    expect(payload.error?.code).toBe("email_taken");
  });

  test("rejects a password shorter than the minimum", async () => {
    const response = await call("/api/auth/register", {
      method: "POST",
      body: { email: uniqueEmail("short"), name: "X", password: "short" },
    });
    expect(response.status).toBe(422);
    const payload = await body<ErrorPayload>(response);
    expect(payload.error.code).toBe("validation_failed");
  });
});

describe("POST /api/auth/login", () => {
  test("signs in with the right password", async () => {
    const email = uniqueEmail("login");
    await register(email, "Login-Test");
    const response = await call("/api/auth/login", { method: "POST", body: { email, password: "correct-horse-battery" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("toon_session=");
  });

  test("answers invalid_credentials for a wrong password, and for an unknown address, in the same shape", async () => {
    const email = uniqueEmail("wrongpw");
    await register(email, "Wrong PW");

    const wrongPassword = await call("/api/auth/login", { method: "POST", body: { email, password: "not-the-password" } });
    expect(wrongPassword.status).toBe(401);
    expect((await body<ErrorPayload>(wrongPassword)).error.code).toBe("invalid_credentials");

    const unknown = await call("/api/auth/login", {
      method: "POST",
      body: { email: uniqueEmail("unknown"), password: "not-the-password" },
    });
    expect(unknown.status).toBe(401);
    expect((await body<ErrorPayload>(unknown)).error.code).toBe("invalid_credentials");
  });
});

describe("session lifecycle", () => {
  test("GET /api/auth/me requires a session", async () => {
    const response = await call("/api/auth/me");
    expect(response.status).toBe(401);
  });

  test("register -> me -> logout -> me is unauthorized again", async () => {
    const email = uniqueEmail("lifecycle");
    const { user } = await register(email, "Lifecycle");
    const cookie = user.cookie;

    const me = await call("/api/auth/me", { cookie });
    expect(me.status).toBe(200);

    const logout = await call("/api/auth/logout", { method: "POST", cookie });
    expect(logout.status).toBe(204);

    const meAfter = await call("/api/auth/me", { cookie });
    expect(meAfter.status).toBe(401);
  });

  test("PATCH /api/auth/me updates the profile", async () => {
    const email = uniqueEmail("patchme");
    const { user } = await register(email, "Vorher");
    const cookie = user.cookie;

    const patch = await call("/api/auth/me", { method: "PATCH", cookie, body: { name: "Nachher", locale: "en" } });
    expect(patch.status).toBe(200);
    const payload = await body<{ id: string; name: string; locale: string }>(patch);
    expect(payload.name).toBe("Nachher");
    expect(payload.locale).toBe("en");
  });

  test("GET /api/auth/sessions lists the current session and DELETE revokes it", async () => {
    const email = uniqueEmail("sessions");
    const { user } = await register(email, "Sessions");
    const cookie = user.cookie;

    const list = await call("/api/auth/sessions", { cookie });
    expect(list.status).toBe(200);
    const { items } = await body<{ items: { handle: string; current: boolean }[] }>(list);
    expect(items).toHaveLength(1);
    expect(items[0]?.current).toBe(true);

    const revoke = await call(`/api/auth/sessions/${items[0]?.handle}`, { method: "DELETE", cookie });
    expect(revoke.status).toBe(204);

    const meAfter = await call("/api/auth/me", { cookie });
    expect(meAfter.status).toBe(401);
  });
});

describe("password change / forgot / reset", () => {
  test("POST /api/auth/password requires the current password and signs out other sessions", async () => {
    const email = uniqueEmail("changepw");
    const { user } = await register(email, "Change PW");
    const cookie = user.cookie;

    const missing = await call("/api/auth/password", { method: "POST", cookie, body: { currentPassword: "", newPassword: "new-correct-horse" } });
    expect(missing.status).toBe(422);
    expect((await body<ErrorPayload>(missing)).error.code).toBe("password_required");

    const wrong = await call("/api/auth/password", {
      method: "POST",
      cookie,
      body: { currentPassword: "not-it", newPassword: "new-correct-horse" },
    });
    expect(wrong.status).toBe(401);

    const changed = await call("/api/auth/password", {
      method: "POST",
      cookie,
      body: { currentPassword: "correct-horse-battery", newPassword: "new-correct-horse" },
    });
    expect(changed.status).toBe(204);

    const loginOld = await call("/api/auth/login", { method: "POST", body: { email, password: "correct-horse-battery" } });
    expect(loginOld.status).toBe(401);
    const loginNew = await call("/api/auth/login", { method: "POST", body: { email, password: "new-correct-horse" } });
    expect(loginNew.status).toBe(200);
  });

  test("POST /api/auth/password/forgot always answers 204, known or unknown address", async () => {
    const email = uniqueEmail("forgot");
    await register(email, "Forgot");

    const known = await call("/api/auth/password/forgot", { method: "POST", body: { email } });
    expect(known.status).toBe(204);

    const unknown = await call("/api/auth/password/forgot", { method: "POST", body: { email: uniqueEmail("nope") } });
    expect(unknown.status).toBe(204);
  });

  test("an unknown reset token is rejected uniformly", async () => {
    const response = await call("/api/auth/password/reset", { method: "POST", body: { token: "not-a-real-token", password: "new-correct-horse" } });
    expect(response.status).toBe(400);
    expect((await body<ErrorPayload>(response)).error.code).toBe("reset_token_invalid");
  });
});
