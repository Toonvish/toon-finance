/**
 * User records: lookup, creation, profile updates, and the row -> session/
 * wire DTO mappings used across auth + household services.
 */
import type { SessionUser } from "../../lib/types.ts";
import type { UserResponse } from "@toon/shared";
import { isLocale } from "@toon/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { type UserRow, users } from "../../db/schema.ts";
import { env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";
import { toIso } from "../../lib/http.ts";
import type { DbLike } from "../support.ts";

/**
 * A PLACEHOLDER is a person seated in a household without an account behind
 * them (docs/spec.md §2.1): `email`, `email_normalized` and `password_hash`
 * are all null. The hash is the predicate — an account can never lose its
 * hash, and a placeholder never gains one without the other two.
 */
export function isPlaceholderUser(row: Pick<UserRow, "passwordHash">): boolean {
  return row.passwordHash === null;
}

/**
 * A placeholder has no login path (nothing to look up by, nothing to verify),
 * so a session naming one is a programming error, not a user-facing state.
 * Both mappers refuse it as 401 rather than inventing an empty address.
 */
function requireAccountEmail(row: UserRow): string {
  if (row.email === null) throw ApiError.unauthorized();
  return row.email;
}

/** Row -> the minimal shape every request handler needs (never the hash). */
export function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: requireAccountEmail(row),
    name: row.name,
    locale: isLocale(row.locale) ? row.locale : env.defaultLocale,
  };
}

/** Row -> the full wire shape `GET/PATCH /api/auth/me` and register/login expose. */
export function toUserResponse(row: UserRow): UserResponse {
  return {
    id: row.id,
    email: requireAccountEmail(row),
    name: row.name,
    locale: isLocale(row.locale) ? row.locale : env.defaultLocale,
    createdAt: toIso(row.createdAt),
  };
}

/** `email` is already normalized by `EmailSchema` (trim + lowercase) before it reaches here. */
export async function findUserByEmail(database: Database, email: string): Promise<UserRow | undefined> {
  const rows = await database.select().from(users).where(eq(users.emailNormalized, email.trim().toLowerCase())).limit(1);
  return rows[0];
}

export async function findUserById(database: Database, id: string): Promise<UserRow | undefined> {
  const rows = await database.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

/** Inserts a user, mapping the unique-email constraint to 409 `email_taken`. */
export async function createUser(database: Database, input: CreateUserInput): Promise<UserRow> {
  const now = Date.now();
  const emailNormalized = input.email.trim().toLowerCase();
  const row: UserRow = {
    id: crypto.randomUUID(),
    email: input.email.trim(),
    emailNormalized,
    name: input.name.trim(),
    passwordHash: input.passwordHash,
    locale: env.defaultLocale,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await database.insert(users).values(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict("email_taken", "server.auth.emailTaken");
    throw error;
  }
  return row;
}

/**
 * Inserts a placeholder user — a name and nothing else. Only ever called by
 * `addPlaceholderMember` (members.service.ts), which seats the row in the
 * same breath; a placeholder outside a household is an orphan nobody can see.
 */
export async function createPlaceholderUser(database: DbLike, name: string): Promise<UserRow> {
  const now = Date.now();
  const row: UserRow = {
    id: crypto.randomUUID(),
    email: null,
    emailNormalized: null,
    name: name.trim(),
    passwordHash: null,
    locale: env.defaultLocale,
    createdAt: now,
    updatedAt: now,
  };
  await database.insert(users).values(row);
  return row;
}

export interface ClaimUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

/**
 * Turns a placeholder into an account IN PLACE — same id, so every
 * `payer_id`, `person_id` and membership row keeps naming the same person.
 * 409 `email_taken` when the address already belongs to another account;
 * 409 `member_has_account` if the row was claimed meanwhile (a second claim
 * would otherwise overwrite someone's password).
 */
export async function claimPlaceholderUser(database: DbLike, userId: string, input: ClaimUserInput): Promise<UserRow> {
  const rows = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound();
  if (!isPlaceholderUser(row)) throw ApiError.conflict("member_has_account", "server.household.memberHasAccount");
  try {
    await database
      .update(users)
      .set({
        email: input.email.trim(),
        emailNormalized: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        passwordHash: input.passwordHash,
        updatedAt: Date.now(),
      })
      .where(eq(users.id, userId));
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict("email_taken", "server.auth.emailTaken");
    throw error;
  }
  const updated = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!updated[0]) throw ApiError.internal();
  return updated[0];
}

export interface UpdateProfileInput {
  name?: string;
  locale?: "de" | "en";
  passwordHash?: string;
}

/** Applies a profile patch and returns the updated row. */
export async function updateUser(database: Database, userId: string, patch: UpdateProfileInput): Promise<UserRow> {
  await database.update(users).set({ ...patch, updatedAt: Date.now() }).where(eq(users.id, userId));
  const row = await findUserById(database, userId);
  if (!row) throw ApiError.unauthorized();
  return row;
}

const UNIQUE_VIOLATION_RE = /unique constraint|sqlite_constraint_unique|constraint failed: users\.email/i;

/**
 * True for a SQLite UNIQUE constraint failure, whatever the driver wraps it in
 * — and it always wraps it in something. Drizzle turns EVERY query failure
 * into a `DrizzleQueryError` whose own `message` is only `Failed query: insert
 * into "incomes" …` and whose `code` is `undefined`; the driver's
 * `LibsqlError` (`SQLITE_CONSTRAINT: UNIQUE constraint failed: …`) sits one
 * level down in `cause`. Inspecting just the top level therefore answered
 * `false` for every unique violation this codebase can actually produce, and
 * each of the four 409s built on this helper degraded into an unhandled 500 —
 * `POST …/plan/incomes` with a duplicate `validFrom` was a plain
 * `internal_error` (`email_taken` looked fine only because the register route
 * pre-checks the address and never reaches its catch). Hence: walk the chain,
 * depth-capped so a self-referential `cause` cannot spin.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth++) {
    const text =
      current instanceof Error
        ? `${current.message} ${String((current as { code?: unknown }).code ?? "")}`
        : String(current);
    if (UNIQUE_VIOLATION_RE.test(text)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
