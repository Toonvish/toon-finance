/**
 * Mounted at /api/auth (see src/index.ts). Email + password only — no OAuth,
 * no e-mail confirmation (docs/spec.md §1.2 #4). Bun.password (argon2id)
 * hashing, opaque DB sessions with a 30-day sliding cookie.
 *
 * This file also owns middleware/session.ts (requireSession / optionalSession)
 * and middleware/household.ts (requireHousehold), both consumed by every
 * other router.
 */
import {
  type AuthSessionResponse,
  ChangePasswordRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  type MeResponse,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  type SessionListResponse,
  serverText,
  UpdateProfileRequestSchema,
  type UserResponse,
} from "@toon/shared";
import { Hono } from "hono";
import type { z } from "zod";
import { db } from "../db/client.ts";
import { env } from "../env.ts";
import { clearSessionCookie, setSessionCookie } from "../lib/cookies.ts";
import { ApiError } from "../lib/errors.ts";
import { created, json, noContent } from "../lib/http.ts";
import type { AppContext, AppEnv } from "../lib/types.ts";
import { requireUser } from "../lib/types.ts";
import { requireSession } from "../middleware/session.ts";
import { acceptInvite, loadRedeemableInvite } from "../services/auth/invites.ts";
import { consumePasswordReset, createPasswordResetToken } from "../services/auth/passwordReset.ts";
import { hashPassword, verifyPassword } from "../services/auth/passwords.ts";
import {
  FORGOT_PASSWORD_EMAIL_RULE,
  FORGOT_PASSWORD_RULE,
  LOGIN_EMAIL_RULE,
  LOGIN_RULE,
  PASSWORD_RESET_RULE,
  REGISTER_RULE,
  clientIp,
  enforceRateLimit,
} from "../services/auth/rateLimit.ts";
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
  findSessionByHandle,
  listSessionsForUser,
} from "../services/auth/sessions.ts";
import { createUser, findUserByEmail, findUserById, toUserResponse, updateUser } from "../services/auth/users.service.ts";
import { createHousehold, listHouseholdsForUser } from "../services/households/households.service.ts";
import { passwordResetMail, trySendMail } from "../services/mail/index.ts";

export const authRoutes = new Hono<AppEnv>();

/* ------------------------------- helpers --------------------------------- */

/** Parses + validates a JSON body. A malformed body is 400, a schema mismatch is 422. */
async function readJson<S extends z.ZodType>(c: AppContext, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw ApiError.badRequest("server.auth.invalidJsonBody");
  }
  return schema.parse(raw) as z.output<S>;
}

/** What we store on a session row for the "signed-in devices" screen. */
function fingerprint(c: AppContext): { ipAddress: string; userAgent: string | null } {
  return { ipAddress: clientIp(c), userAgent: c.req.header("user-agent") ?? null };
}

/** Creates the session row and sets the cookie. */
async function startSession(c: AppContext, userId: string): Promise<void> {
  const session = await createSession(db, userId, fingerprint(c));
  setSessionCookie(c, session.id, session.expiresAt);
}

/** Builds `AuthSessionResponse` / `MeResponse`'s shared half from a user id. */
async function authPayload(userId: string): Promise<AuthSessionResponse> {
  const row = await findUserById(db, userId);
  if (!row) throw ApiError.unauthorized();
  const households = await listHouseholdsForUser(db, userId);
  return { user: toUserResponse(row), household: households[0] ?? null };
}

/* ----------------------------- registration ------------------------------ */

authRoutes.post("/register", async (c) => {
  const body = await readJson(c, RegisterRequestSchema);
  enforceRateLimit(c, "register", clientIp(c), REGISTER_RULE);

  // Validate the invite BEFORE creating anything, so a bad token cannot leave
  // a user without a household behind.
  if (body.inviteToken) await loadRedeemableInvite(db, body.inviteToken);

  if (await findUserByEmail(db, body.email)) {
    throw ApiError.conflict("email_taken", "server.auth.emailTaken");
  }

  const passwordHash = await hashPassword(body.password);
  const user = await createUser(db, { email: body.email, name: body.name, passwordHash });

  if (body.inviteToken) {
    await acceptInvite(db, body.inviteToken, user.id, body.name);
  } else {
    await createHousehold(db, user.id, {
      name: serverText(env.defaultLocale, "server.content.householdDefaultName"),
      displayName: body.name,
    });
  }

  await startSession(c, user.id);
  return created(c, await authPayload(user.id));
});

/* -------------------------------- login ---------------------------------- */

authRoutes.post("/login", async (c) => {
  const body = await readJson(c, LoginRequestSchema);
  enforceRateLimit(c, "login", `${clientIp(c)}|${body.email}`, LOGIN_RULE);
  // Second ceiling that no forwarding header can reset — see LOGIN_EMAIL_RULE.
  enforceRateLimit(c, "login-email", body.email, LOGIN_EMAIL_RULE);

  const user = await findUserByEmail(db, body.email);
  // Always runs an argon2id verification (dummy hash for unknown accounts),
  // so the response time does not reveal whether the e-mail exists.
  const matches = await verifyPassword(body.password, user?.passwordHash ?? null);
  if (!user || !matches) throw ApiError.invalidCredentials();

  await startSession(c, user.id);
  const payload: AuthSessionResponse = await authPayload(user.id);
  return json(c, payload);
});

/* -------------------------------- logout --------------------------------- */

authRoutes.post("/logout", requireSession(), async (c) => {
  const sessionId = c.get("sessionId");
  if (sessionId) await deleteSession(db, sessionId);
  clearSessionCookie(c);
  return noContent(c);
});

/* --------------------------------- me ------------------------------------ */

authRoutes.get("/me", requireSession(), async (c) => {
  const user = requireUser(c);
  const row = await findUserById(db, user.id);
  if (!row) throw ApiError.unauthorized();
  const householdSummaries = await listHouseholdsForUser(db, user.id);
  const payload: MeResponse = {
    user: toUserResponse(row),
    households: householdSummaries,
    activeHouseholdId: householdSummaries[0]?.id ?? null,
  };
  return json(c, payload);
});

authRoutes.patch("/me", requireSession(), async (c) => {
  const user = requireUser(c);
  const body = await readJson(c, UpdateProfileRequestSchema);

  const patch: Parameters<typeof updateUser>[2] = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.locale !== undefined) patch.locale = body.locale;

  const row = await updateUser(db, user.id, patch);
  const payload: UserResponse = toUserResponse(row);
  return json(c, payload);
});

/* ------------------------------ password --------------------------------- */

authRoutes.post("/password", requireSession(), async (c) => {
  const user = requireUser(c);
  const body = await readJson(c, ChangePasswordRequestSchema);

  const row = await findUserById(db, user.id);
  if (!row) throw ApiError.unauthorized();

  if (!body.currentPassword) {
    throw new ApiError(422, "password_required", "server.auth.passwordRequired");
  }
  const matches = await verifyPassword(body.currentPassword, row.passwordHash);
  if (!matches) throw ApiError.invalidCredentials();

  const passwordHash = await hashPassword(body.newPassword);
  await updateUser(db, user.id, { passwordHash });
  // A password change signs every other device out.
  await deleteOtherSessions(db, user.id, c.get("sessionId"));
  return noContent(c);
});

/**
 * POST /api/auth/password/forgot — mails a reset link.
 *
 * ALWAYS 204, identical body and timing for a known and an unknown address
 * (docs/spec.md §3.4): the rate limit is enforced BEFORE the lookup, a
 * missing account simply skips the send, and a failed send is swallowed by
 * `trySendMail` — none of the three may turn this into a "does this person
 * have an account here?" oracle.
 *
 * With no MAIL_TRANSPORT configured, `scripts/reset-password.ts` is the
 * self-hosted fallback (same tokens, same endpoint, no mailer required).
 */
authRoutes.post("/password/forgot", async (c) => {
  const body = await readJson(c, ForgotPasswordRequestSchema);
  enforceRateLimit(c, "password-forgot", clientIp(c), FORGOT_PASSWORD_RULE);
  enforceRateLimit(c, "password-forgot-email", body.email, FORGOT_PASSWORD_EMAIL_RULE);

  const user = await findUserByEmail(db, body.email);
  if (user) {
    const { token } = await createPasswordResetToken(db, user.id);
    const origin = env.webOrigins[0] ?? "";
    await trySendMail(
      passwordResetMail({
        to: user.email,
        url: `${origin.replace(/\/+$/, "")}/reset-password/${token}`,
        locale: user.locale,
      }),
    );
  }

  return noContent(c);
});

/**
 * POST /api/auth/password/reset — spends the token and sets the new password.
 * Answers 204 and does NOT sign the user in: every session of that user is
 * deleted, and the web app sends them to `/login?reset=1`.
 */
authRoutes.post("/password/reset", async (c) => {
  const body = await readJson(c, ResetPasswordRequestSchema);
  enforceRateLimit(c, "password-reset", clientIp(c), PASSWORD_RESET_RULE);

  await consumePasswordReset(db, body.token, body.password);
  clearSessionCookie(c);
  return noContent(c);
});

/* ------------------------------- sessions -------------------------------- */

authRoutes.get("/sessions", requireSession(), async (c) => {
  const user = requireUser(c);
  const items = await listSessionsForUser(db, user.id, c.get("sessionId"));
  const payload: SessionListResponse = { items };
  return json(c, payload);
});

authRoutes.delete("/sessions/:handle", requireSession(), async (c) => {
  const user = requireUser(c);
  const target = await findSessionByHandle(db, user.id, c.req.param("handle"));
  if (!target) throw ApiError.notFound();

  await deleteSession(db, target.id);
  if (target.id === c.get("sessionId")) clearSessionCookie(c);
  return noContent(c);
});

export default authRoutes;
