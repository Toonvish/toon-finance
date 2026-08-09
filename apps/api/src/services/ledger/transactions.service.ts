/**
 * The cash book itself: create/read/update/delete plus the filtered,
 * paginated list (docs/spec.md §3.6). `kindToStorage`/`projectKind` and every
 * cent computation come from `@toon/shared` — nothing here re-derives a
 * formula.
 *
 * Idempotency (docs/spec.md §2.9, CLAUDE.md gotcha #9/#10): `createTransaction`
 * claims `mutationId` and links it to the new row inside ONE `withTransaction`,
 * so a claim can never be left pointing at nothing. `updateTransaction` /
 * `deleteTransaction` already know the target id, so they claim WITH it
 * up front and simply skip re-applying when the claim was already held.
 */
import {
  type CreateTransactionRequest,
  type SplitModeValue,
  type TransactionListResponse,
  type TransactionOriginValue,
  type TransactionResponse,
  type TxKindValue,
  type UpdateTransactionRequest,
  halfForOther,
  isExpense as isExpenseTx,
  kindToStorage,
} from "@toon/shared";
import { and, asc, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { categories, transactionTags, transactions, type TransactionRow } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import { nowMs } from "../../lib/clock.ts";
import { toIso } from "../../lib/http.ts";
import { otherMemberId, requireOtherMemberId, slot1UserId } from "../households/members.service.ts";
import { withTransaction, type DbLike } from "../support.ts";
import { categorySlugOf } from "../categories/categories.service.ts";
import { clearTransactionTags, syncTransactionTags, tagRefsOf } from "../tags/tags.service.ts";
import { sammelbuchungTransactionIds } from "./aggregateExclusion.ts";
import { computeBalanceDelta } from "./balance.service.ts";
import { parseRangeBound } from "./dateRange.ts";
import { claimMutation, linkMutationClaim, peekMutationClaim } from "./idempotency.ts";

/** The non-payer's share, by the same rule for every splitMode (docs/ledger-spec.md §2.3): the whole amount unless it is split. */
function otherShareOf(splitMode: SplitModeValue, amountCents: number): number {
  return splitMode === "SPLIT_EQUAL" ? halfForOther(amountCents) : amountCents;
}

async function toResponse(db: DbLike, row: TransactionRow, person1Id: string): Promise<TransactionResponse> {
  const [categorySlug, tagRefs] = await Promise.all([categorySlugOf(db, row.categoryId), tagRefsOf(db, row.id)]);
  const otherShareCents = otherShareOf(row.splitMode, row.amountCents);
  return {
    id: row.id,
    householdId: row.householdId,
    payerId: row.payerId,
    splitMode: row.splitMode,
    amountCents: row.amountCents,
    description: row.description,
    categoryId: row.categoryId,
    categorySlug,
    tags: tagRefs,
    bookedAt: toIso(row.bookedAt),
    dateSource: row.dateSource,
    origin: row.origin,
    planPeriod: row.planPeriod,
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    otherShareCents,
    payerShareCents: row.amountCents - otherShareCents,
    balanceDeltaCents: computeBalanceDelta(row, person1Id),
    isExpense: isExpenseTx(row),
  };
}

async function loadRowOr404(db: DbLike, householdId: string, transactionId: string): Promise<TransactionRow> {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.householdId, householdId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound("server.transaction.notFound");
  return row;
}

function assertManual(row: TransactionRow): void {
  if (row.origin !== "manual") throw ApiError.conflict("transaction_generated", "server.transaction.generated");
}

/** Resolves the `otherId` `kindToStorage` needs, throwing only for the two kinds that actually require one. */
async function resolveOtherId(db: DbLike, householdId: string, viewerId: string, kind: TxKindValue): Promise<string> {
  if (kind === "THEIRS_SPLIT" || kind === "TRANSFER") {
    return requireOtherMemberId(db, householdId, viewerId);
  }
  return (await otherMemberId(db, householdId, viewerId)) ?? viewerId;
}

async function assertCategoryExists(db: DbLike, householdId: string, categoryId: string): Promise<void> {
  const rows = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.householdId, householdId))).limit(1);
  if (rows.length === 0) throw ApiError.notFound();
}

export interface CreateTransactionServiceInput extends CreateTransactionRequest {
  householdId: string;
  viewerId: string;
  createdBy: string;
}

export interface MutationOutcome {
  response: TransactionResponse;
  /** false when this call was a replay of an already-applied `mutationId`. */
  applied: boolean;
}

/**
 * `POST …/transactions`. Claim + insert + link all run inside ONE
 * `withTransaction`, so a mutation claim is never left pointing at a row that
 * does not exist (docs/spec.md §2.9).
 */
export async function createTransaction(db: Database, input: CreateTransactionServiceInput): Promise<MutationOutcome> {
  return withTransaction(db, async (tx) => {
    const person1Id = await slot1UserId(tx, input.householdId);

    if (input.mutationId) {
      const claim = await claimMutation(tx, input.mutationId, input.householdId, null);
      if (!claim.claimed) {
        if (!claim.transactionId) throw ApiError.internal();
        const existing = await loadRowOr404(tx, input.householdId, claim.transactionId);
        return { response: await toResponse(tx, existing, person1Id), applied: false };
      }
    }

    if (input.categoryId) await assertCategoryExists(tx, input.householdId, input.categoryId);

    const otherId = await resolveOtherId(tx, input.householdId, input.viewerId, input.kind);
    const { payerId, splitMode } = kindToStorage(input.kind, input.viewerId, otherId);

    const id = crypto.randomUUID();
    const timestamp = nowMs();
    await tx.insert(transactions).values({
      id,
      householdId: input.householdId,
      payerId,
      splitMode,
      amountCents: input.amountCents,
      description: input.description,
      categoryId: input.categoryId ?? null,
      bookedAt: input.bookedAt ? Date.parse(input.bookedAt) : timestamp,
      dateSource: "exact",
      origin: "manual",
      planPeriod: null,
      categorySource: "manual",
      importSeq: null,
      externalKey: null,
      createdBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await syncTransactionTags(tx, input.householdId, id, input.tags ?? []);
    if (input.mutationId) await linkMutationClaim(tx, input.mutationId, id);

    const row = await loadRowOr404(tx, input.householdId, id);
    return { response: await toResponse(tx, row, person1Id), applied: true };
  });
}

export interface UpdateTransactionServiceInput extends UpdateTransactionRequest {
  householdId: string;
  viewerId: string;
}

/** `PATCH …/transactions/:transactionId`. `409 transaction_generated` unless `origin === "manual"`. */
export async function updateTransaction(
  db: Database,
  transactionId: string,
  input: UpdateTransactionServiceInput,
): Promise<MutationOutcome> {
  return withTransaction(db, async (tx) => {
    const person1Id = await slot1UserId(tx, input.householdId);
    const existing = await loadRowOr404(tx, input.householdId, transactionId);
    assertManual(existing);

    if (input.mutationId) {
      const claim = await claimMutation(tx, input.mutationId, input.householdId, transactionId);
      if (!claim.claimed) {
        const current = await loadRowOr404(tx, input.householdId, transactionId);
        return { response: await toResponse(tx, current, person1Id), applied: false };
      }
    }

    if (input.categoryId) await assertCategoryExists(tx, input.householdId, input.categoryId);

    const patch: Partial<typeof transactions.$inferInsert> = { updatedAt: nowMs() };

    if (input.kind !== undefined) {
      const otherId = await resolveOtherId(tx, input.householdId, input.viewerId, input.kind);
      const { payerId, splitMode } = kindToStorage(input.kind, input.viewerId, otherId);
      patch.payerId = payerId;
      patch.splitMode = splitMode;
    }
    if (input.amountCents !== undefined) patch.amountCents = input.amountCents;
    if (input.description !== undefined) patch.description = input.description;
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.bookedAt !== undefined) patch.bookedAt = Date.parse(input.bookedAt);

    await tx.update(transactions).set(patch).where(eq(transactions.id, transactionId));
    if (input.tags !== undefined) await syncTransactionTags(tx, input.householdId, transactionId, input.tags);

    const row = await loadRowOr404(tx, input.householdId, transactionId);
    return { response: await toResponse(tx, row, person1Id), applied: true };
  });
}

/**
 * `DELETE …/transactions/:transactionId`. `409 transaction_generated` unless
 * `origin === "manual"`. Idempotent under a replayed `mutationId` —
 * INCLUDING after the row is already gone, which is the case a naive
 * "load-then-claim" ordering misses: the row a replay would 404 on looking
 * up IS the evidence the first delivery already succeeded. `peekMutationClaim`
 * checks the claim by `mutationId` alone, before `transactions` is touched at
 * all, so that case answers 204 (already applied) instead of 404.
 */
export async function deleteTransaction(db: Database, householdId: string, transactionId: string, mutationId?: string): Promise<void> {
  await withTransaction(db, async (tx) => {
    if (mutationId && (await peekMutationClaim(tx, mutationId))) return; // replay of an already-applied delete

    const existing = await loadRowOr404(tx, householdId, transactionId);
    assertManual(existing);

    if (mutationId) {
      const claim = await claimMutation(tx, mutationId, householdId, transactionId);
      if (!claim.claimed) return; // lost a race with a concurrent delivery of this same call
    }

    await clearTransactionTags(tx, transactionId);
    await tx.delete(transactions).where(eq(transactions.id, transactionId));
  });
}

export async function getTransaction(db: Database, householdId: string, transactionId: string): Promise<TransactionResponse> {
  const person1Id = await slot1UserId(db, householdId);
  const row = await loadRowOr404(db, householdId, transactionId);
  return toResponse(db, row, person1Id);
}

export interface TransactionListFilters {
  from?: string;
  to?: string;
  kind?: TxKindValue;
  splitMode?: SplitModeValue;
  payerId?: string;
  categoryId?: string;
  tagIds?: string;
  origin?: TransactionOriginValue;
  q?: string;
  includeAggregates: boolean;
  sort: "bookedAt" | "-bookedAt" | "amount" | "-amount";
  limit: number;
  offset: number;
}

/** Transaction ids that carry ALL of `tagIds` (docs/spec.md §3.6). Empty result short-circuits the caller to an empty page. */
async function transactionIdsWithAllTags(db: Database, tagIds: readonly string[]): Promise<string[]> {
  const rows = await db
    .select({ transactionId: transactionTags.transactionId, tagCount: sql<number>`count(distinct ${transactionTags.tagId})` })
    .from(transactionTags)
    .where(inArray(transactionTags.tagId, [...tagIds]))
    .groupBy(transactionTags.transactionId)
    .having(sql`count(distinct ${transactionTags.tagId}) = ${tagIds.length}`);
  return rows.map((row) => row.transactionId);
}

function resolveKindFilter(kind: TxKindValue, viewerId: string, otherId: string): { payerId: string; splitMode: SplitModeValue } {
  return kindToStorage(kind, viewerId, otherId);
}

export async function listTransactions(
  db: Database,
  householdId: string,
  viewerId: string,
  filters: TransactionListFilters,
): Promise<TransactionListResponse> {
  const person1Id = await slot1UserId(db, householdId);
  const conditions = [eq(transactions.householdId, householdId)];

  if (filters.from) conditions.push(gte(transactions.bookedAt, parseRangeBound(filters.from, "from")));
  if (filters.to) conditions.push(lte(transactions.bookedAt, parseRangeBound(filters.to, "to")));
  if (filters.splitMode) conditions.push(eq(transactions.splitMode, filters.splitMode));
  if (filters.payerId) conditions.push(eq(transactions.payerId, filters.payerId));
  if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId));
  if (filters.origin) conditions.push(eq(transactions.origin, filters.origin));
  if (filters.q && filters.q.trim().length > 0) {
    conditions.push(sql`lower(${transactions.description}) like ${`%${filters.q.trim().toLowerCase()}%`}`);
  }

  if (filters.kind) {
    const otherId = (await otherMemberId(db, householdId, viewerId)) ?? viewerId;
    const { payerId, splitMode } = resolveKindFilter(filters.kind, viewerId, otherId);
    conditions.push(eq(transactions.payerId, payerId), eq(transactions.splitMode, splitMode));
  }

  if (filters.tagIds) {
    const ids = filters.tagIds.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
    if (ids.length > 0) {
      const matching = await transactionIdsWithAllTags(db, ids);
      if (matching.length === 0) return { items: [], total: 0, limit: filters.limit, offset: filters.offset };
      conditions.push(inArray(transactions.id, matching));
    }
  }

  if (!filters.includeAggregates) {
    const excluded = await sammelbuchungTransactionIds(db, householdId);
    if (excluded.length > 0) conditions.push(notInArray(transactions.id, excluded));
  }

  const where = and(...conditions);
  const [{ value: total } = { value: 0 }] = await db.select({ value: sql<number>`count(*)` }).from(transactions).where(where);

  const orderColumns =
    filters.sort === "bookedAt"
      ? [asc(transactions.bookedAt), asc(transactions.importSeq)]
      : filters.sort === "amount"
        ? [asc(transactions.amountCents)]
        : filters.sort === "-amount"
          ? [desc(transactions.amountCents)]
          : [desc(transactions.bookedAt), desc(transactions.importSeq)];

  const rows = await db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(...orderColumns)
    .limit(filters.limit)
    .offset(filters.offset);

  const items = await Promise.all(rows.map((row) => toResponse(db, row, person1Id)));
  return { items, total: Number(total), limit: filters.limit, offset: filters.offset };
}

export { toResponse as toTransactionResponse, otherShareOf };
