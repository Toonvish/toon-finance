/**
 * Shared integration-test harness: fake a signed-in user by inserting a
 * `sessions` row directly (no dependency on `POST /login`), and a thin
 * `app.request()` wrapper. This is the pattern every [API-DOMÄNE] test file
 * should copy (docs/reference-architecture.md §7.2, pattern B — the shared
 * process DB, because the real router reads the `db` singleton).
 */
import { db } from "../../src/db/client.ts";
import { sessions, users } from "../../src/db/schema.ts";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  cookie: string;
}

/** Creates a user row plus a valid session cookie for it. */
export async function createUser(name: string): Promise<TestUser> {
  const id = crypto.randomUUID();
  const email = `${name.toLowerCase()}.${id.slice(0, 8)}@toon.test`;
  await db.insert(users).values({
    id,
    email,
    emailNormalized: email,
    name,
    passwordHash: "unused-in-these-tests",
  });
  const sessionId = crypto.randomUUID().replaceAll("-", "");
  await db.insert(sessions).values({ id: sessionId, userId: id, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 });
  return { id, email, name, cookie: `toon_session=${sessionId}` };
}

export interface CallOptions {
  method?: string;
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** `app.request()` wrapper: JSON in, `Response` out. No port is bound. */
export async function call(path: string, options: CallOptions = {}): Promise<Response> {
  const { app } = await import("../../src/index.ts");
  const headers: Record<string, string> = { ...options.headers };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export interface HouseholdPayload {
  id: string;
  name: string;
  memberCount: number;
}

/** Creates a household owned by `user` via the real `POST /api/households` endpoint. */
export async function createHousehold(user: TestUser, name: string): Promise<string> {
  const response = await call("/api/households", { method: "POST", cookie: user.cookie, body: { name } });
  if (response.status !== 201) {
    throw new Error(`createHousehold failed: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  const payload = await body<HouseholdPayload>(response);
  return payload.id;
}
