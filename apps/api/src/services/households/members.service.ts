/**
 * Household membership: seating a member into a free slot (the DB-enforced
 * "exactly two people" rule, docs/spec.md §2.4), renaming, and leaving.
 */
import type { MemberResponse } from "@toon/shared";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { householdMembers, transactions, users } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import { nowMs } from "../../lib/clock.ts";
import { toIso } from "../../lib/http.ts";
import type { DbLike } from "../support.ts";

/** Slots currently occupied in a household — at most `{1, 2}`. */
async function occupiedSlots(db: Database, householdId: string): Promise<Set<1 | 2>> {
  const rows = await db
    .select({ memberSlot: householdMembers.memberSlot })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
  return new Set(rows.map((row) => (row.memberSlot === 2 ? 2 : 1)));
}

/**
 * Seats `userId` into the first free slot of `householdId`.
 * Throws 409 `household_full` when both slots are already taken.
 */
export async function assignSlot(
  db: Database,
  householdId: string,
  userId: string,
  displayName: string,
): Promise<1 | 2> {
  const taken = await occupiedSlots(db, householdId);
  const slot: 1 | 2 | undefined = !taken.has(1) ? 1 : !taken.has(2) ? 2 : undefined;
  if (slot === undefined) throw ApiError.conflict("household_full", "server.household.full");

  const timestamp = nowMs();
  await db.insert(householdMembers).values({
    householdId,
    userId,
    memberSlot: slot,
    displayName,
    joinedAt: timestamp,
  });
  return slot;
}

function toMemberResponse(
  member: { memberSlot: number; displayName: string; joinedAt: number },
  user: { id: string; name: string; email: string },
): MemberResponse {
  return {
    userId: user.id,
    displayName: member.displayName,
    memberSlot: member.memberSlot === 2 ? 2 : 1,
    name: user.name,
    email: user.email,
    joinedAt: toIso(member.joinedAt),
  };
}

/** Members of a household incl. their public user record — ONE joined query. */
export async function listMembers(db: Database, householdId: string): Promise<MemberResponse[]> {
  const rows = await db
    .select({ member: householdMembers, user: users })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(householdMembers.memberSlot);
  return rows.map((row) => toMemberResponse(row.member, row.user));
}

/**
 * The userId of the household member who is NOT `viewerId` — the unambiguous
 * "other person" a two-slot household guarantees (docs/spec.md §2.4). Used by
 * the ledger ([API-DOMÄNE] transactions/plan/settlements) to resolve
 * `kindToStorage`/`computePlanForPeriod` without ever trusting a client-picked
 * id. `null` when the second seat is still empty (an invite pending) — the
 * caller decides whether that is fatal for the operation at hand.
 */
export async function otherMemberId(db: DbLike, householdId: string, viewerId: string): Promise<string | null> {
  const rows = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .limit(2);
  const other = rows.find((row) => row.userId !== viewerId);
  return other?.userId ?? null;
}

/**
 * {@link otherMemberId}, but throws `409 conflict` (`server.household.
 * needsSecondMember`) instead of returning `null` — for operations that
 * genuinely cannot proceed without a second member (booking a `THEIRS_SPLIT`/
 * `TRANSFER` row, running the fixed-cost plan).
 */
export async function requireOtherMemberId(db: DbLike, householdId: string, viewerId: string): Promise<string> {
  const other = await otherMemberId(db, householdId, viewerId);
  if (!other) throw ApiError.conflict("conflict", "server.household.needsSecondMember");
  return other;
}

/**
 * The userId seated at `member_slot 1` — the balance sign convention's anchor
 * (docs/spec.md §2.4: `balanceCents > 0` means slot 2 owes slot 1). Every
 * household has a slot 1 the moment it is created (its owner), so a missing
 * row here is a programming error, not a user-facing state.
 */
export async function slot1UserId(db: DbLike, householdId: string): Promise<string> {
  const rows = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.memberSlot, 1)))
    .limit(1);
  const userId = rows[0]?.userId;
  if (!userId) throw ApiError.internal();
  return userId;
}

/** The membership row of one user, mapped to the contract shape (404 if none). */
export async function getMember(db: Database, householdId: string, userId: string): Promise<MemberResponse> {
  const rows = await db
    .select({ member: householdMembers, user: users })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound();
  return toMemberResponse(row.member, row.user);
}

/** Renames the caller's own display name inside the household. */
export async function updateMemberDisplayName(
  db: Database,
  householdId: string,
  userId: string,
  displayName: string,
): Promise<MemberResponse> {
  await getMember(db, householdId, userId);
  await db
    .update(householdMembers)
    .set({ displayName })
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
  return getMember(db, householdId, userId);
}

/**
 * Removes `userId` from the household — the "leave" flow, only ever the
 * caller's own membership (docs/spec.md §3.5: "bei zwei Personen ist 'den
 * anderen rauswerfen' keine Funktion, sondern ein Streit"). Refuses with 409
 * `member_has_ledger` while any transaction still names this person as payer
 * — the balance would otherwise hang off a member who no longer exists.
 */
export async function removeMember(db: Database, householdId: string, userId: string): Promise<void> {
  await getMember(db, householdId, userId);

  const ledgerRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.payerId, userId)))
    .limit(1);
  if (ledgerRows.length > 0) {
    throw ApiError.conflict("member_has_ledger", "server.household.memberHasLedger");
  }

  await db
    .delete(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
}
