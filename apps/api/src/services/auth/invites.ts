/**
 * Household invites. The token IS the capability: whoever holds the link may
 * join, so the invited e-mail is informational and deliberately NOT enforced
 * (docs/spec.md §2.5 — otherwise a forwarded link would break).
 *
 * `POST .../invites` mails the link AND returns it; the mail is a
 * convenience, the returned `inviteUrl` is the source of truth (a self-hosted
 * install may have no MAIL_TRANSPORT at all, and a provider outage must not
 * stop someone from inviting their partner over WhatsApp instead).
 */
import type { AcceptInviteResponse, InviteListResponse, InviteResponse, Locale } from "@toon/shared";
import { isLocale } from "@toon/shared";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { type InviteRow, households, invites, users } from "../../db/schema.ts";
import { env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";
import { nowMs } from "../../lib/clock.ts";
import { toIso } from "../../lib/http.ts";
import { getHouseholdResponse, memberCountOf } from "../households/households.service.ts";
import { assignSlot, getMember } from "../households/members.service.ts";
import { inviteMail, mailDeliveryOf, trySendMail } from "../mail/index.ts";

/** Invite links are valid for 14 days (docs/spec.md §3.5). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** 32 random bytes, URL-safe base64 (43 chars). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** `${WEB_ORIGIN}/invite/<token>` — the link the household member copies. */
function buildInviteUrl(token: string): string {
  const origin = env.webOrigins[0] ?? "";
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

function toInviteResponse(row: InviteRow, mailDelivery: InviteResponse["mailDelivery"]): InviteResponse {
  return {
    id: row.id,
    token: row.token,
    inviteUrl: buildInviteUrl(row.token),
    email: row.email,
    status: row.status,
    expiresAt: toIso(row.expiresAt),
    createdAt: toIso(row.createdAt),
    mailDelivery,
  };
}

/**
 * Creates an invite for `householdId`. Refuses `409 household_full` up front
 * when both slots are taken — issuing a link that can never be redeemed is
 * less honest than letting it fail at accept time (docs/spec.md §3.5). Any
 * older pending invite of the same household is revoked first: a household
 * has AT MOST ONE open invite, and a second one is the expected "send it
 * again" path, not an error.
 */
export async function createInvite(
  db: Database,
  householdId: string,
  invitedBy: string,
  email: string | undefined,
): Promise<InviteResponse> {
  const memberCount = await memberCountOf(db, householdId);
  if (memberCount >= 2) throw ApiError.conflict("household_full", "server.household.full");

  const timestamp = nowMs();
  const id = crypto.randomUUID();
  const token = generateInviteToken();

  await db
    .update(invites)
    .set({ status: "revoked" })
    .where(and(eq(invites.householdId, householdId), eq(invites.status, "pending")));

  await db.insert(invites).values({
    id,
    householdId,
    token,
    email: email ?? null,
    invitedBy,
    status: "pending",
    expiresAt: timestamp + INVITE_TTL_MS,
    createdAt: timestamp,
  });

  const household = await getHouseholdResponse(db, householdId);
  const [inviter] = await db.select({ name: users.name, locale: users.locale }).from(users).where(eq(users.id, invitedBy)).limit(1);
  const locale: Locale = isLocale(inviter?.locale) ? inviter.locale : env.defaultLocale;

  const row = await findInviteByToken(db, token);
  if (!row) throw ApiError.internal();

  // AFTER the row is committed, and never able to fail the request: an
  // invite that exists but was not mailed is useful (copy the link); a 500
  // that leaves a committed invite behind is not. trySendMail() swallows and
  // logs.
  const sent = email
    ? await trySendMail(
        inviteMail({
          to: email,
          household: household.name,
          name: inviter?.name ?? "",
          url: buildInviteUrl(token),
          locale,
        }),
      )
    : undefined;

  return toInviteResponse(row, sent ? mailDeliveryOf(sent) : "not_configured");
}

/** Raw invite row for a token, or undefined. */
export async function findInviteByToken(database: Database, token: string): Promise<InviteRow | undefined> {
  if (token.length === 0 || token.length > 200) return undefined;
  const rows = await database.select().from(invites).where(eq(invites.token, token)).limit(1);
  return rows[0];
}

/**
 * Validates an invite for redemption.
 * 404 `invite_invalid` — unknown or revoked (or already redeemed by someone else)
 * 409 `invite_expired` — past `expires_at` (the row is flagged `expired`)
 */
export async function loadRedeemableInvite(database: Database, token: string): Promise<InviteRow> {
  const invite = await findInviteByToken(database, token);
  if (!invite || invite.status === "revoked") {
    throw new ApiError(404, "invite_invalid", "server.invite.invalid");
  }
  if (invite.expiresAt <= nowMs()) {
    if (invite.status === "pending") {
      await database.update(invites).set({ status: "expired" }).where(eq(invites.id, invite.id));
    }
    throw new ApiError(409, "invite_expired", "server.invite.expired");
  }
  if (invite.status === "expired") {
    throw new ApiError(409, "invite_expired", "server.invite.expired");
  }
  return invite;
}

/** Public landing-page preview ("Du wurdest zum Haushalt X eingeladen"). */
export async function previewInvite(
  db: Database,
  token: string,
): Promise<{ householdName: string; invitedByName: string; expiresAt: string }> {
  const invite = await loadRedeemableInvite(db, token);
  const [row] = await db
    .select({ householdName: households.name, invitedByName: users.name })
    .from(invites)
    .innerJoin(households, eq(households.id, invites.householdId))
    .innerJoin(users, eq(users.id, invites.invitedBy))
    .where(eq(invites.id, invite.id))
    .limit(1);
  if (!row) throw new ApiError(404, "invite_invalid", "server.invite.invalid");
  return { householdName: row.householdName, invitedByName: row.invitedByName, expiresAt: toIso(invite.expiresAt) };
}

/**
 * Redeems an invite for `userId`, seating them in the household's free slot.
 * Idempotent: a user who is already a member gets `alreadyMember: true` and
 * keeps their existing slot — nobody is ever downgraded.
 */
export async function acceptInvite(
  db: Database,
  token: string,
  userId: string,
  displayName: string,
): Promise<AcceptInviteResponse> {
  const invite = await loadRedeemableInvite(db, token);
  const now = nowMs();

  const existing = await getMember(db, invite.householdId, userId).catch(() => undefined);

  if (existing) {
    if (invite.status === "pending") {
      await db.update(invites).set({ status: "accepted", acceptedBy: userId, acceptedAt: now }).where(eq(invites.id, invite.id));
    }
    return {
      household: await getHouseholdResponse(db, invite.householdId),
      memberSlot: existing.memberSlot,
      alreadyMember: true,
    };
  }

  const memberSlot = await assignSlot(db, invite.householdId, userId, displayName);
  await db.update(invites).set({ status: "accepted", acceptedBy: userId, acceptedAt: now }).where(eq(invites.id, invite.id));

  return { household: await getHouseholdResponse(db, invite.householdId), memberSlot, alreadyMember: false };
}

/** Paginated-in-shape invite list (no pagination params in the contract — a household has very few). */
export async function listInvites(db: Database, householdId: string): Promise<InviteListResponse> {
  const rows = await db.select().from(invites).where(eq(invites.householdId, householdId)).orderBy(desc(invites.createdAt));
  return { items: rows.map((row) => toInviteResponse(row, "not_configured")) };
}

/** Revokes a pending invite (idempotent for already-revoked ones). */
export async function revokeInvite(db: Database, householdId: string, inviteId: string): Promise<void> {
  const rows = await db.select({ id: invites.id }).from(invites).where(and(eq(invites.id, inviteId), eq(invites.householdId, householdId))).limit(1);
  if (rows.length === 0) throw ApiError.notFound();
  await db.update(invites).set({ status: "revoked" }).where(eq(invites.id, inviteId));
}
