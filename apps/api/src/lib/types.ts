/**
 * The Hono environment shared by ALL routers. Every sub-router is declared as
 * `new Hono<AppEnv>()` so that context variables set by middleware are typed.
 *
 * Contract between the agents:
 * - middleware/session.ts sets `user` + `sessionId` (requireSession)
 * - middleware/household.ts sets `household` (requireHousehold)
 * Handlers read them with c.get("user") / c.get("household"); the
 * non-optional getters below throw a 401/403/404-shaped ApiError if the
 * middleware was forgotten, so a missing `router.use(...)` fails loudly
 * instead of quietly returning `undefined` deep in a service.
 */
import type { Locale, MemberSlot } from "@toon/shared";
import type { Context } from "hono";
import { ApiError } from "./errors.ts";

/** The session user, as every handler needs it — never the password hash. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  locale: Locale;
}

/** Set by `requireHousehold()` for every `/api/households/:householdId/*` route. */
export interface HouseholdContext {
  householdId: string;
  userId: string;
  memberSlot: MemberSlot;
}

export interface AppVariables {
  /** Set by requireSession (and by optionalSession when a cookie is present). */
  user?: SessionUser;
  /** Session id (cookie value) of the current request. */
  sessionId?: string;
  /** Set by requireHousehold() for every household-scoped route. */
  household?: HouseholdContext;
  /**
   * Set by `localeMiddleware` (lib/locale.ts). OPTIONAL on purpose:
   * `onError`/`notFound` can fire before an `app.use("*")` middleware has run,
   * so `requestLocale(c)`'s `?? env.defaultLocale` is load-bearing — do not
   * type this as required, it would read as dead code.
   */
  locale?: Locale;
}

export type AppEnv = { Variables: AppVariables };

export type AppContext = Context<AppEnv>;

/** Returns the authenticated user or throws 401. */
export function requireUser(c: AppContext): SessionUser {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  return user;
}

/**
 * Returns the verified household membership or throws 403.
 *
 * NAME COLLISION, ON PURPOSE (docs/spec.md §5.3 names both this way):
 * `middleware/household.ts` exports a DIFFERENT `requireHousehold()` — the
 * router-level middleware FACTORY (`router.use("*", requireHousehold())`).
 * A file that needs both (every [API-DOMÄNE] route handler will) must alias
 * one import, e.g. `import { requireHousehold as requireHouseholdContext }
 * from "../lib/types.ts"` — see routes/households.ts for the pattern.
 */
export function requireHousehold(c: AppContext): HouseholdContext {
  const household = c.get("household");
  if (!household) throw ApiError.forbidden("server.household.noAccess");
  return household;
}
