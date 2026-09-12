/**
 * Mounted at /api/households (see src/index.ts). Households, membership and
 * invites. Membership is verified exclusively by `requireHousehold()`
 * (middleware/household.ts) — there is not a single inline membership check
 * below.
 *
 * The two fixed `/invites/...` routes are registered BEFORE `/:householdId`,
 * otherwise "invites" would be captured as a householdId.
 *
 * Endpoint contract: docs/spec.md §3.5.
 */
import { zValidator } from "@hono/zod-validator";
import {
  AcceptInviteRequestSchema,
  type AcceptInviteResponse,
  CreateHouseholdRequestSchema,
  CreateInviteRequestSchema,
  CreatePlaceholderMemberRequestSchema,
  type HouseholdDetailResponse,
  type HouseholdListResponse,
  UpdateHouseholdRequestSchema,
  UpdateMemberRequestSchema,
} from "@toon/shared";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { ApiError } from "../lib/errors.ts";
import { created, json, noContent } from "../lib/http.ts";
import type { AppEnv } from "../lib/types.ts";
import { requireHousehold as requireHouseholdContext } from "../lib/types.ts";
import { requireUser } from "../lib/types.ts";
import { onValidationError } from "../lib/validation.ts";
import { requireHousehold } from "../middleware/household.ts";
import { requireSession } from "../middleware/session.ts";
import { acceptInvite, createInvite, listInvites, previewInvite, revokeInvite } from "../services/auth/invites.ts";
import { HOUSEHOLD_CREATE_RULE, INVITE_RULE, enforceRateLimit } from "../services/auth/rateLimit.ts";
import {
  createHousehold,
  getHouseholdResponse,
  listHouseholdsForUser,
  updateHousehold,
} from "../services/households/households.service.ts";
import {
  addPlaceholderMember,
  isPlaceholderMember,
  listMembers,
  removeMember,
  removePlaceholderMember,
  updateMemberDisplayName,
} from "../services/households/members.service.ts";

export const householdsRoutes = new Hono<AppEnv>();

/* -------------------------------------------------------------------------- */
/* my households                                                              */
/* -------------------------------------------------------------------------- */

/** GET /api/households — every household the caller belongs to. */
householdsRoutes.get("/", requireSession(), async (c) => {
  const user = requireUser(c);
  const payload: HouseholdListResponse = { items: await listHouseholdsForUser(db, user.id) };
  return json(c, payload);
});

/**
 * POST /api/households — the rare "start a new household" path (a deleted
 * household, or an invited account that later wants its own). There is no
 * household switcher in the UI: `MeResponse.activeHouseholdId` is simply the
 * first (and practically only) entry.
 */
householdsRoutes.post(
  "/",
  requireSession(),
  zValidator("json", CreateHouseholdRequestSchema, onValidationError),
  async (c) => {
    const user = requireUser(c);
    enforceRateLimit(c, "household-create", user.id, HOUSEHOLD_CREATE_RULE);
    const body = c.req.valid("json");
    const householdId = await createHousehold(db, user.id, {
      name: body.name,
      displayName: body.displayName ?? user.name,
    });
    const payload = await getHouseholdResponse(db, householdId);
    return created(c, payload, `/api/households/${householdId}`);
  },
);

/* -------------------------------------------------------------------------- */
/* invites (fixed paths — MUST stay above /:householdId)                     */
/* -------------------------------------------------------------------------- */

/** GET /api/households/invites/:token — public preview for the landing page. */
householdsRoutes.get("/invites/:token", async (c) => {
  return json(c, await previewInvite(db, c.req.param("token")));
});

/** POST /api/households/invites/accept — join the household behind a token. */
householdsRoutes.post(
  "/invites/accept",
  requireSession(),
  zValidator("json", AcceptInviteRequestSchema, onValidationError),
  async (c) => {
    const user = requireUser(c);
    const body = c.req.valid("json");
    const payload: AcceptInviteResponse = await acceptInvite(db, body.token, user.id, body.displayName ?? user.name);
    return json(c, payload);
  },
);

/* -------------------------------------------------------------------------- */
/* one household                                                              */
/* -------------------------------------------------------------------------- */

/** GET /api/households/:householdId — household + members + the viewer's own slot. */
householdsRoutes.get("/:householdId", requireSession(), requireHousehold(), async (c) => {
  const household = requireHouseholdContext(c);
  const [row, members] = await Promise.all([
    getHouseholdResponse(db, household.householdId),
    listMembers(db, household.householdId),
  ]);
  const payload: HouseholdDetailResponse = { household: row, members, viewerSlot: household.memberSlot };
  return json(c, payload);
});

/** PATCH /api/households/:householdId — rename / change the default locale. */
householdsRoutes.patch(
  "/:householdId",
  requireSession(),
  requireHousehold(),
  zValidator("json", UpdateHouseholdRequestSchema, onValidationError),
  async (c) => {
    const household = requireHouseholdContext(c);
    const payload = await updateHousehold(db, household.householdId, c.req.valid("json"));
    return json(c, payload);
  },
);

/* -------------------------------------------------------------------------- */
/* members                                                                    */
/* -------------------------------------------------------------------------- */

/** GET /api/households/:householdId/members */
householdsRoutes.get("/:householdId/members", requireSession(), requireHousehold(), async (c) => {
  const household = requireHouseholdContext(c);
  return json(c, { items: await listMembers(db, household.householdId) });
});

/**
 * POST /api/households/:householdId/members — seat a PLACEHOLDER: a person
 * without an account, named by the member who is already here. The seat is
 * real (slot 2, a payer the ledger can name); the login comes later through
 * a claim invite (`POST …/invites { claimsUserId }`). 409 `household_full`.
 */
householdsRoutes.post(
  "/:householdId/members",
  requireSession(),
  requireHousehold(),
  zValidator("json", CreatePlaceholderMemberRequestSchema, onValidationError),
  async (c) => {
    const household = requireHouseholdContext(c);
    const member = await addPlaceholderMember(db, household.householdId, c.req.valid("json").displayName);
    return created(c, member, `/api/households/${household.householdId}/members/${member.userId}`);
  },
);

/**
 * Yourself, or the household's placeholder. At two real members, changing
 * the OTHER person's seat is not a feature (docs/spec.md §3.5) — but a
 * placeholder has no login, so the only hands that can rename or remove it
 * are the other member's. Anything else is 403.
 */
async function assertMayEditMember(householdId: string, callerId: string, targetUserId: string): Promise<boolean> {
  if (targetUserId === callerId) return false;
  if (await isPlaceholderMember(db, householdId, targetUserId)) return true;
  throw ApiError.forbidden();
}

/**
 * PATCH /api/households/:householdId/members/:userId — rename the caller's
 * OWN display name, or the placeholder's.
 */
householdsRoutes.patch(
  "/:householdId/members/:userId",
  requireSession(),
  requireHousehold(),
  zValidator("json", UpdateMemberRequestSchema, onValidationError),
  async (c) => {
    const household = requireHouseholdContext(c);
    const targetUserId = c.req.param("userId");
    await assertMayEditMember(household.householdId, household.userId, targetUserId);
    const member = await updateMemberDisplayName(db, household.householdId, targetUserId, c.req.valid("json").displayName);
    return json(c, member);
  },
);

/**
 * DELETE /api/households/:householdId/members/:userId — leave the household
 * (your own membership), or remove the placeholder (their whole user row goes
 * with them). 409 `member_has_ledger` while any transaction still names this
 * person as payer.
 */
householdsRoutes.delete("/:householdId/members/:userId", requireSession(), requireHousehold(), async (c) => {
  const household = requireHouseholdContext(c);
  const targetUserId = c.req.param("userId");
  const isPlaceholder = await assertMayEditMember(household.householdId, household.userId, targetUserId);
  if (isPlaceholder) await removePlaceholderMember(db, household.householdId, targetUserId);
  else await removeMember(db, household.householdId, targetUserId);
  return noContent(c);
});

/* -------------------------------------------------------------------------- */
/* invites of a household                                                     */
/* -------------------------------------------------------------------------- */

/** GET /api/households/:householdId/invites */
householdsRoutes.get("/:householdId/invites", requireSession(), requireHousehold(), async (c) => {
  const household = requireHouseholdContext(c);
  return json(c, await listInvites(db, household.householdId));
});

/** POST /api/households/:householdId/invites — returns the shareable inviteUrl. */
householdsRoutes.post(
  "/:householdId/invites",
  requireSession(),
  requireHousehold(),
  zValidator("json", CreateInviteRequestSchema, onValidationError),
  async (c) => {
    const household = requireHouseholdContext(c);
    const user = requireUser(c);
    const body = c.req.valid("json");
    // Only the MAILING variant is metered — copying a link sends nothing.
    if (body.email !== undefined) enforceRateLimit(c, "invite-mail", user.id, INVITE_RULE);
    const result = await createInvite(db, household.householdId, user.id, { email: body.email, claimsUserId: body.claimsUserId });
    return created(c, result);
  },
);

/** DELETE /api/households/:householdId/invites/:inviteId */
householdsRoutes.delete("/:householdId/invites/:inviteId", requireSession(), requireHousehold(), async (c) => {
  const household = requireHouseholdContext(c);
  await revokeInvite(db, household.householdId, c.req.param("inviteId"));
  return noContent(c);
});

export default householdsRoutes;
