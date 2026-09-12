/**
 * Household membership: seating a member into a free slot (the DB-enforced
 * "exactly two people" rule, docs/spec.md §2.4), renaming, and leaving.
 */
import type { MemberResponse } from "@toon/shared";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { fixedCostPlans, householdMembers, incomes, invites, transactions, users } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import { nowMs } from "../../lib/clock.ts";
import { toIso } from "../../lib/http.ts";
import { createPlaceholderUser, isPlaceholderUser, isUniqueViolation } from "../auth/users.service.ts";
import { type DbLike, withTransaction } from "../support.ts";

/** Slots currently occupied in a household — at most `{1, 2}`. */
async function occupiedSlots(db: DbLike, householdId: string): Promise<Set<1 | 2>> {
  const rows = await db
    .select({ memberSlot: householdMembers.memberSlot })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
  return new Set(rows.map((row) => (row.memberSlot === 2 ? 2 : 1)));
}

/**
 * Seats `userId` into the first free slot of `householdId`.
 * Throws 409 `household_full` when both slots are already taken.
 *
 * The SELECT above is an optimisation, not the guarantee: two accepts racing
 * for the same last free seat both read it as free, and only
 * `household_members_slot_uidx` decides. That is on purpose — the
 * two-person rule is a DB fact, not a service convention (decision #1) — so
 * losing the race has to answer `409 household_full` exactly as if the read
 * had seen the seat taken, never a raw SQLite error escaping as a 500.
 */
export async function assignSlot(
  db: DbLike,
  householdId: string,
  userId: string,
  displayName: string,
): Promise<1 | 2> {
  const taken = await occupiedSlots(db, householdId);
  const slot: 1 | 2 | undefined = !taken.has(1) ? 1 : !taken.has(2) ? 2 : undefined;
  if (slot === undefined) throw ApiError.conflict("household_full", "server.household.full");

  const timestamp = nowMs();
  try {
    await db.insert(householdMembers).values({
      householdId,
      userId,
      memberSlot: slot,
      displayName,
      joinedAt: timestamp,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict("household_full", "server.household.full");
    throw error;
  }
  return slot;
}

function toMemberResponse(
  member: { memberSlot: number; displayName: string; joinedAt: number },
  user: { id: string; name: string; email: string | null; passwordHash: string | null },
): MemberResponse {
  return {
    userId: user.id,
    displayName: member.displayName,
    memberSlot: member.memberSlot === 2 ? 2 : 1,
    name: user.name,
    email: user.email,
    hasAccount: !isPlaceholderUser(user),
    joinedAt: toIso(member.joinedAt),
  };
}

/**
 * Seats a PLACEHOLDER — a person without an account — in the free slot
 * (docs/spec.md §3.5). The user row and the membership are written in one
 * transaction: a placeholder that exists but sits in no household is an
 * orphan nobody can ever see or claim. 409 `household_full` as for any seat.
 */
export async function addPlaceholderMember(db: Database, householdId: string, displayName: string): Promise<MemberResponse> {
  const userId = await withTransaction(db, async (tx) => {
    const user = await createPlaceholderUser(tx, displayName);
    await assignSlot(tx, householdId, user.id, displayName);
    return user.id;
  });
  return getMember(db, householdId, userId);
}

/**
 * True when `userId` is seated in `householdId` AND has no account. The
 * routes use it to widen "only yourself" to "yourself or the placeholder":
 * someone without a login cannot rename or remove themselves, so the other
 * member does it for them — and ONLY for them (a real second person is still
 * never edited by anyone else, docs/spec.md §3.5).
 */
export async function isPlaceholderMember(db: Database, householdId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .limit(1);
  const row = rows[0];
  return row !== undefined && isPlaceholderUser(row);
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
  const member = await getMember(db, householdId, userId);

  const ledgerRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.payerId, userId)))
    .limit(1);
  if (ledgerRows.length > 0) {
    throw ApiError.conflict("member_has_ledger", "server.household.memberHasLedger");
  }

  // The fixed-cost plan names a payer, and `createHousehold` seeds it with
  // the owner — so "is the payer" alone cannot block leaving, or no owner
  // could ever leave. An ENABLED plan is different: it would keep booking
  // every month against a payer who is no longer a member, and
  // `otherMemberId()` would then charge the person who stayed with nobody on
  // the other side of the balance. A disabled plan is re-pointed at the
  // remaining member below instead, so enabling it later starts from a
  // member, not a ghost.
  const [plan] = await db
    .select({ payerId: fixedCostPlans.payerId, enabled: fixedCostPlans.enabled })
    .from(fixedCostPlans)
    .where(eq(fixedCostPlans.householdId, householdId))
    .limit(1);
  if (plan?.payerId === userId && plan.enabled) {
    throw ApiError.conflict("member_has_ledger", "server.household.memberHasLedger");
  }

  // Slot 1 anchors the balance sign convention (`slot1UserId`), and every
  // ledger endpoint resolves it. If slot 1 left while slot 2 is seated, the
  // remaining person's `/transactions`, `/balance` and `/settlements` would
  // all fail until someone new accepted an invite — one DELETE by a hostile
  // partner would wedge the other person's app. Slot 2 leaves first.
  if (member.memberSlot === 1 && (await memberCount(db, householdId)) > 1) {
    throw ApiError.conflict("conflict", "server.household.anchorCannotLeave");
  }

  const remaining = await otherMemberId(db, householdId, userId);
  await withTransaction(db, async (tx) => {
    // Incomes are plan input FOR a person; a person who left has none here.
    await tx.delete(incomes).where(and(eq(incomes.householdId, householdId), eq(incomes.personId, userId)));
    if (plan?.payerId === userId && remaining !== null) {
      await tx.update(fixedCostPlans).set({ payerId: remaining, updatedAt: nowMs() }).where(eq(fixedCostPlans.householdId, householdId));
    }
    await tx.delete(householdMembers).where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
  });
}

async function memberCount(db: DbLike, householdId: string): Promise<number> {
  const rows = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .limit(2);
  return rows.length;
}

/**
 * Removes a PLACEHOLDER from the household and deletes the user row behind
 * it — unlike {@link removeMember}, nothing survives: there is no account
 * that could join another household later. Same `member_has_ledger` rule
 * (any transaction naming them as payer, or the fixed-cost plan naming them
 * as ITS payer — both `RESTRICT` FKs, and both mean the ledger still needs
 * this person). Their income rows go with them: incomes are plan input for a
 * person, and a person who leaves without a single booking leaves no history
 * anyone could reconstruct from them. Open claim invites cascade away with
 * the row (`invites.claims_user_id`).
 */
export async function removePlaceholderMember(db: Database, householdId: string, userId: string): Promise<void> {
  if (!(await isPlaceholderMember(db, householdId, userId))) throw ApiError.notFound();

  const ledgerRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.payerId, userId)))
    .limit(1);
  const planRows = await db
    .select({ householdId: fixedCostPlans.householdId })
    .from(fixedCostPlans)
    .where(and(eq(fixedCostPlans.householdId, householdId), eq(fixedCostPlans.payerId, userId)))
    .limit(1);
  if (ledgerRows.length > 0 || planRows.length > 0) {
    throw ApiError.conflict("member_has_ledger", "server.household.memberHasLedger");
  }

  await withTransaction(db, async (tx) => {
    await tx.delete(incomes).where(and(eq(incomes.householdId, householdId), eq(incomes.personId, userId)));
    await tx.delete(invites).where(eq(invites.claimsUserId, userId));
    await tx.delete(householdMembers).where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
    await tx.delete(users).where(eq(users.id, userId));
  });
}
