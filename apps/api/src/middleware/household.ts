/**
 * Household authorisation middleware — the ONLY place that decides whether
 * the session user may touch a household's data. Routers apply it once, as a
 * router-level middleware, NEVER inline in a handler:
 *
 *   transactionRoutes.use("*", requireSession());
 *   transactionRoutes.use("*", requireHousehold());
 *
 * Semantics (docs/spec.md §3.1):
 *   no session              -> 401 unauthorized
 *   unknown household       -> 404 not_found   (never leaks that it exists)
 *   not a member            -> 403 forbidden
 *   ok                      -> c.set("household", { householdId, userId, memberSlot })
 *
 * The household id normally comes from the `:householdId` path param (every
 * ledger route in docs/spec.md §3.6-§3.10 is nested under
 * `/api/households/:householdId/...`). `via` exists for the rare route that
 * addresses a resource directly instead — kept here rather than duplicated in
 * every future [API-DOMÄNE] router, the same shape as toon-recipe's
 * `requireGroupRole` (docs/reference-architecture.md §2.6).
 *
 * NAME COLLISION, ON PURPOSE: `lib/types.ts` exports a DIFFERENT
 * `requireHousehold(c)` — the in-handler getter for `c.get("household")`.
 * A handler that needs both this factory and that getter must alias one on
 * import; see routes/households.ts.
 */
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { categories, householdMembers, households, transactions } from "../db/schema.ts";
import { db } from "../db/client.ts";
import { ApiError } from "../lib/errors.ts";
import type { AppContext, AppEnv, HouseholdContext } from "../lib/types.ts";
import { requireUser } from "../lib/types.ts";

/** Route params that identify a household-scoped resource directly. */
const RESOURCE_PARAMS = ["transactionId", "categoryId"] as const;
export type ResourceParam = (typeof RESOURCE_PARAMS)[number];

export interface HouseholdOptions {
  /** Force resolution through a specific resource param instead of `:householdId`. */
  via?: ResourceParam;
}

/** Looks up the owning household of a resource id, or null if it does not exist. */
async function householdIdOfResource(param: ResourceParam, id: string): Promise<string | null> {
  if (param === "transactionId") {
    const rows = await db
      .select({ householdId: transactions.householdId })
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    return rows[0]?.householdId ?? null;
  }
  const rows = await db
    .select({ householdId: categories.householdId })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  return rows[0]?.householdId ?? null;
}

/**
 * Determines which household the request targets. Throws 404 when an
 * addressed resource does not exist, and `household_required` (400-ish via
 * `bad_request`) when the route carries no usable id at all — that should
 * never happen with a correctly mounted router, so it is a programming error,
 * not a user-facing state.
 */
export async function resolveHouseholdId(c: AppContext, options: HouseholdOptions = {}): Promise<string> {
  if (!options.via) {
    const direct = c.req.param("householdId");
    if (direct && direct.length > 0) return direct;
  }

  const candidates: readonly ResourceParam[] = options.via ? [options.via] : RESOURCE_PARAMS;
  for (const param of candidates) {
    const id = c.req.param(param);
    if (!id || id.length === 0) continue;
    const householdId = await householdIdOfResource(param, id);
    if (!householdId) throw ApiError.notFound();
    return householdId;
  }

  throw ApiError.badRequest();
}

/**
 * Membership of `userId` in `householdId`, distinguishing "household unknown"
 * from "not a member" in a SINGLE query (LEFT JOIN — docs/reference-
 * architecture.md §2.6): a two-query version could report "not a member" for
 * a household that was deleted between the two reads.
 */
export async function resolveMembership(
  householdId: string,
  userId: string,
): Promise<{ exists: boolean; membership?: HouseholdContext }> {
  const rows = await db
    .select({ id: households.id, memberSlot: householdMembers.memberSlot })
    .from(households)
    .leftJoin(
      householdMembers,
      and(eq(householdMembers.householdId, households.id), eq(householdMembers.userId, userId)),
    )
    .where(eq(households.id, householdId))
    .limit(1);

  const row = rows[0];
  if (!row) return { exists: false };
  if (row.memberSlot === null) return { exists: true };
  const memberSlot = row.memberSlot === 2 ? 2 : 1;
  return { exists: true, membership: { householdId, userId, memberSlot } };
}

/** Factory: middleware requiring session-user membership in the addressed household. */
export function requireHousehold(options: HouseholdOptions = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = requireUser(c);
    const householdId = await resolveHouseholdId(c, options);
    const access = await resolveMembership(householdId, user.id);

    if (!access.exists) throw ApiError.notFound();
    if (!access.membership) throw ApiError.forbidden("server.household.noAccess");

    c.set("household", access.membership);
    await next();
  };
}
