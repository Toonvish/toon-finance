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

/** Row -> the minimal shape every request handler needs (never the hash). */
export function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    locale: isLocale(row.locale) ? row.locale : env.defaultLocale,
  };
}

/** Row -> the full wire shape `GET/PATCH /api/auth/me` and register/login expose. */
export function toUserResponse(row: UserRow): UserResponse {
  return {
    id: row.id,
    email: row.email,
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

/** True for a SQLite UNIQUE constraint failure, whatever the driver wraps it in. */
export function isUniqueViolation(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.message} ${String((error as { code?: unknown }).code ?? "")}`
      : String(error);
  return /unique constraint|sqlite_constraint_unique|constraint failed: users\.email/i.test(message);
}
