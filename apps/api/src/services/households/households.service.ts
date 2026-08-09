/**
 * Households: creation (with the Ur-seed every fresh household needs —
 * default categories + the disabled fixed-cost plan row), reads and updates.
 *
 * Membership itself (slots, display names, leaving) lives in
 * `members.service.ts`; invites live in `services/auth/invites.ts`.
 */
import type { HouseholdResponse, HouseholdSummary } from "@toon/shared";
import { currentPeriod } from "@toon/shared";
import { count, eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  categories,
  fixedCostPlans,
  type HouseholdRow,
  householdMembers,
  households,
} from "../../db/schema.ts";
import { env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";
import { nowMs } from "../../lib/clock.ts";
import { toIso } from "../../lib/http.ts";
import { defaultCategorySeeds } from "../categories/defaults.ts";
import { type DbLike, withTransaction } from "../support.ts";

export interface CreateHouseholdInput {
  name: string;
  /** Falls back to the owner's account name when omitted. */
  displayName: string;
}

/**
 * Creates a household, seats `ownerId` in slot 1, seeds the 21 default
 * categories and the (disabled) fixed-cost-plan row — all inside one
 * transaction, so a crash mid-seed never leaves a household with half its
 * categories (docs/spec.md §3.4 register()).
 */
export async function createHousehold(db: Database, ownerId: string, input: CreateHouseholdInput): Promise<string> {
  const id = crypto.randomUUID();
  const timestamp = nowMs();
  const period = currentPeriod(timestamp);

  await withTransaction(db, async (tx) => {
    await tx.insert(households).values({
      id,
      name: input.name,
      defaultLocale: env.defaultLocale,
      createdBy: ownerId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await tx.insert(householdMembers).values({
      householdId: id,
      userId: ownerId,
      memberSlot: 1,
      displayName: input.displayName,
      joinedAt: timestamp,
    });
    await tx.insert(categories).values(
      defaultCategorySeeds().map((seed) => ({
        id: crypto.randomUUID(),
        householdId: id,
        slug: seed.slug,
        customLabel: null,
        isSystem: seed.isSystem,
        isHidden: false,
        position: seed.position,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await tx.insert(fixedCostPlans).values({
      householdId: id,
      enabled: false,
      payerId: ownerId,
      startPeriod: period,
      lastBookedPeriod: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  return id;
}

/** Raw household row or a 404. */
export async function loadHouseholdRow(db: DbLike, householdId: string): Promise<HouseholdRow> {
  const rows = await db.select().from(households).where(eq(households.id, householdId)).limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound();
  return row;
}

/** Number of members currently seated (0, 1 or 2). */
export async function memberCountOf(db: Database, householdId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
  return Number(rows[0]?.value ?? 0);
}

function asMemberCount(value: number): 1 | 2 {
  return value >= 2 ? 2 : 1;
}

export function toHouseholdResponse(row: HouseholdRow, memberCount: number): HouseholdResponse {
  return {
    id: row.id,
    name: row.name,
    defaultLocale: row.defaultLocale,
    memberCount: asMemberCount(memberCount),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export async function getHouseholdResponse(db: Database, householdId: string): Promise<HouseholdResponse> {
  const row = await loadHouseholdRow(db, householdId);
  const memberCount = await memberCountOf(db, householdId);
  return toHouseholdResponse(row, memberCount);
}

/** All households `userId` belongs to, in the compact `MeResponse` shape. */
export async function listHouseholdsForUser(db: Database, userId: string): Promise<HouseholdSummary[]> {
  const rows = await db
    .select({ household: households, memberSlot: householdMembers.memberSlot })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .orderBy(households.createdAt);

  const summaries: HouseholdSummary[] = [];
  for (const row of rows) {
    const memberCount = await memberCountOf(db, row.household.id);
    summaries.push({
      id: row.household.id,
      name: row.household.name,
      memberSlot: row.memberSlot === 2 ? 2 : 1,
      memberCount: asMemberCount(memberCount),
    });
  }
  return summaries;
}

export interface UpdateHouseholdInput {
  name?: string;
  defaultLocale?: "de" | "en";
}

export async function updateHousehold(db: Database, householdId: string, input: UpdateHouseholdInput): Promise<HouseholdResponse> {
  await loadHouseholdRow(db, householdId);
  const patch: Partial<typeof households.$inferInsert> = { updatedAt: nowMs() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.defaultLocale !== undefined) patch.defaultLocale = input.defaultLocale;
  await db.update(households).set(patch).where(eq(households.id, householdId));
  return getHouseholdResponse(db, householdId);
}
