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
import {
  createHousehold,
  getHouseholdResponse,
  listHouseholdsForUser,
  updateHousehold,
} from "../services/households/households.service.ts";
import { listMembers, removeMember, updateMemberDisplayName } from "../services/households/members.service.ts";

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
 * PATCH /api/households/:householdId/members/:userId — rename the caller's
 * OWN display name. At two members, changing someone else's is not a feature
 * (docs/spec.md §3.5), so anything other than the caller's own id is 403.
 */
householdsRoutes.patch(
  "/:householdId/members/:userId",
  requireSession(),
  requireHousehold(),
  zValidator("json", UpdateMemberRequestSchema, onValidationError),
  async (c) => {
    const household = requireHouseholdContext(c);
    const targetUserId = c.req.param("userId");
    if (targetUserId !== household.userId) throw ApiError.forbidden();
    const member = await updateMemberDisplayName(db, household.householdId, targetUserId, c.req.valid("json").displayName);
    return json(c, member);
  },
);

/**
 * DELETE /api/households/:householdId/members/:userId — leave the household.
 * Only ever the caller's own membership; 409 `member_has_ledger` while any
 * transaction still names this person as payer.
 */
householdsRoutes.delete("/:householdId/members/:userId", requireSession(), requireHousehold(), async (c) => {
  const household = requireHouseholdContext(c);
  const targetUserId = c.req.param("userId");
  if (targetUserId !== household.userId) throw ApiError.forbidden();
  await removeMember(db, household.householdId, targetUserId);
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
    const result = await createInvite(db, household.householdId, user.id, c.req.valid("json").email);
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
