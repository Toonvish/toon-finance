/**
 * TanStack Query wiring: one key factory, ready-made `queryOptions` for every
 * read endpoint and invalidation helpers. Feature agents import from here
 * instead of inventing their own keys, otherwise cache invalidation breaks.
 * `WEB-TX` and `WEB-SALDO` share no file — this one is the exception, owned
 * entirely by `WEB-KERN` and carrying the keys BOTH groups need.
 *
 * Key layout (hierarchical on purpose, so a prefix invalidates a whole subtree):
 *   ["toon","me"]
 *   ["toon","household",householdId]                    <- everything household-scoped
 *   ["toon","household",householdId,"transactions",filters]
 *   ["toon","household",householdId,"plan"]
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type {
  BalanceHistoryQuery,
  BalanceQuery,
  PaginationQuery,
  TransactionListQuery,
  TransactionSummaryQuery,
} from "@toon/shared";
import {
  fetchBalance,
  fetchBalanceHistory,
  fetchCategories,
  fetchHealth,
  fetchHousehold,
  fetchHouseholdInvites,
  fetchHouseholdMembers,
  fetchHouseholds,
  fetchInvitePreview,
  fetchMe,
  fetchPlan,
  fetchPlanPreview,
  fetchPlanRuns,
  fetchSessions,
  fetchSettlements,
  fetchTags,
  fetchTransaction,
  fetchTransactionSummary,
  fetchTransactions,
  isApiError,
} from "./api";

/* -------------------------------------------------------------------------- */
/* cache policy                                                               */
/* -------------------------------------------------------------------------- */

export const STALE_TIME = {
  /** Session/bootstrap: cheap, but should feel instant after navigation. */
  session: 60_000,
  /** Lists another person in the household can change any time. */
  list: 30_000,
  /** Single entities. */
  detail: 60_000,
  /** Rarely changing metadata (categories, plan setup). */
  meta: 5 * 60_000,
} as const;

/** Retry policy: never retry a 4xx (the user must change something), retry network/5xx twice with backoff. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.isClientError) return false;
  return failureCount < 2;
}

export const retryDelay = (attempt: number): number => Math.min(1000 * 2 ** attempt, 8000);

/* -------------------------------------------------------------------------- */
/* keys                                                                       */
/* -------------------------------------------------------------------------- */

/** Stable, order-independent serialisation of a list filter object. */
function filterKey(filters: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!filters) return {};
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

const ROOT = "toon" as const;

export const queryKeys = {
  all: [ROOT] as const,
  health: () => [ROOT, "health"] as const,
  me: () => [ROOT, "me"] as const,
  sessions: () => [ROOT, "sessions"] as const,
  households: () => [ROOT, "households"] as const,
  invitePreview: (token: string) => [ROOT, "invite", token] as const,

  /** Prefix for EVERY piece of data belonging to one household. */
  household: (householdId: string) => [ROOT, "household", householdId] as const,
  householdDetail: (householdId: string) => [ROOT, "household", householdId, "detail"] as const,
  householdMembers: (householdId: string) => [ROOT, "household", householdId, "members"] as const,
  householdInvites: (householdId: string) => [ROOT, "household", householdId, "invites"] as const,

  transactions: (householdId: string, query?: Partial<TransactionListQuery>) =>
    [ROOT, "household", householdId, "transactions", filterKey(query)] as const,
  transactionsRoot: (householdId: string) => [ROOT, "household", householdId, "transactions"] as const,
  transaction: (householdId: string, transactionId: string) =>
    [ROOT, "household", householdId, "transaction", transactionId] as const,
  transactionSummary: (householdId: string, query?: Partial<TransactionSummaryQuery>) =>
    [ROOT, "household", householdId, "transaction-summary", filterKey(query)] as const,

  categories: (householdId: string, includeHidden?: boolean) =>
    [ROOT, "household", householdId, "categories", { includeHidden: includeHidden ?? false }] as const,
  tags: (householdId: string, query?: { q?: string; limit?: number }) =>
    [ROOT, "household", householdId, "tags", filterKey(query)] as const,

  plan: (householdId: string) => [ROOT, "household", householdId, "plan"] as const,
  planPreview: (householdId: string, period: string) =>
    [ROOT, "household", householdId, "plan-preview", period] as const,
  planRuns: (householdId: string, query?: Partial<PaginationQuery>) =>
    [ROOT, "household", householdId, "plan-runs", filterKey(query)] as const,

  balance: (householdId: string, query?: Partial<BalanceQuery>) =>
    [ROOT, "household", householdId, "balance", filterKey(query)] as const,
  balanceHistory: (householdId: string, query?: Partial<BalanceHistoryQuery>) =>
    [ROOT, "household", householdId, "balance-history", filterKey(query)] as const,

  settlements: (householdId: string, query?: Partial<PaginationQuery>) =>
    [ROOT, "household", householdId, "settlements", filterKey(query)] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* query options                                                              */
/* -------------------------------------------------------------------------- */

export const healthQuery = () =>
  queryOptions({
    queryKey: queryKeys.health(),
    queryFn: ({ signal }) => fetchHealth({ signal }),
    staleTime: STALE_TIME.list,
  });

/** Bootstrap query. Returns `null` when nobody is logged in (401 is not an error). */
export const meQuery = () =>
  queryOptions({
    queryKey: queryKeys.me(),
    queryFn: async ({ signal }) => {
      try {
        return await fetchMe({ signal });
      } catch (error) {
        if (isApiError(error) && error.isUnauthorized) return null;
        throw error;
      }
    },
    staleTime: STALE_TIME.session,
    retry: shouldRetry,
    retryDelay,
    networkMode: "offlineFirst",
  });

export const sessionsQuery = () =>
  queryOptions({
    queryKey: queryKeys.sessions(),
    queryFn: ({ signal }) => fetchSessions({ signal }),
    staleTime: STALE_TIME.list,
  });

export const householdsQuery = () =>
  queryOptions({
    queryKey: queryKeys.households(),
    queryFn: ({ signal }) => fetchHouseholds({ signal }),
    staleTime: STALE_TIME.list,
  });

export const invitePreviewQuery = (token: string) =>
  queryOptions({
    queryKey: queryKeys.invitePreview(token),
    queryFn: ({ signal }) => fetchInvitePreview(token, { signal }),
    staleTime: STALE_TIME.detail,
    retry: false,
  });

export const householdDetailQuery = (householdId: string) =>
  queryOptions({
    queryKey: queryKeys.householdDetail(householdId),
    queryFn: ({ signal }) => fetchHousehold(householdId, { signal }),
    staleTime: STALE_TIME.detail,
  });

export const householdMembersQuery = (householdId: string) =>
  queryOptions({
    queryKey: queryKeys.householdMembers(householdId),
    queryFn: ({ signal }) => fetchHouseholdMembers(householdId, { signal }),
    staleTime: STALE_TIME.detail,
  });

export const householdInvitesQuery = (householdId: string) =>
  queryOptions({
    queryKey: queryKeys.householdInvites(householdId),
    queryFn: ({ signal }) => fetchHouseholdInvites(householdId, { signal }),
    staleTime: STALE_TIME.list,
  });

/**
 * The transaction list. `networkMode: "offlineFirst"` + persisted (see
 * `lib/persist.ts`) so a cold, offline start still renders the last-seen
 * ledger instead of hanging in `pending`.
 */
export const transactionsQuery = (householdId: string, query: Partial<TransactionListQuery> = {}) =>
  queryOptions({
    queryKey: queryKeys.transactions(householdId, query),
    queryFn: ({ signal }) => fetchTransactions(householdId, query, { signal }),
    staleTime: STALE_TIME.list,
    networkMode: "offlineFirst",
  });

export const transactionQuery = (householdId: string, transactionId: string) =>
  queryOptions({
    queryKey: queryKeys.transaction(householdId, transactionId),
    queryFn: ({ signal }) => fetchTransaction(householdId, transactionId, { signal }),
    staleTime: STALE_TIME.detail,
    networkMode: "offlineFirst",
  });

export const transactionSummaryQuery = (
  householdId: string,
  query: Partial<TransactionSummaryQuery> = {},
) =>
  queryOptions({
    queryKey: queryKeys.transactionSummary(householdId, query),
    queryFn: ({ signal }) => fetchTransactionSummary(householdId, query, { signal }),
    staleTime: STALE_TIME.list,
    networkMode: "offlineFirst",
  });

export const categoriesQuery = (householdId: string, includeHidden?: boolean) =>
  queryOptions({
    queryKey: queryKeys.categories(householdId, includeHidden),
    queryFn: ({ signal }) => fetchCategories(householdId, includeHidden, { signal }),
    staleTime: STALE_TIME.meta,
    networkMode: "offlineFirst",
  });

export const tagsQuery = (householdId: string, query: { q?: string; limit?: number } = {}) =>
  queryOptions({
    queryKey: queryKeys.tags(householdId, query),
    queryFn: ({ signal }) => fetchTags(householdId, query, { signal }),
    staleTime: STALE_TIME.meta,
  });

export const planQuery = (householdId: string) =>
  queryOptions({
    queryKey: queryKeys.plan(householdId),
    queryFn: ({ signal }) => fetchPlan(householdId, { signal }),
    staleTime: STALE_TIME.detail,
    networkMode: "offlineFirst",
  });

export const planPreviewQuery = (householdId: string, period: string) =>
  queryOptions({
    queryKey: queryKeys.planPreview(householdId, period),
    queryFn: ({ signal }) => fetchPlanPreview(householdId, period, { signal }),
    staleTime: STALE_TIME.detail,
  });

export const planRunsQuery = (householdId: string, query: Partial<PaginationQuery> = {}) =>
  queryOptions({
    queryKey: queryKeys.planRuns(householdId, query),
    queryFn: ({ signal }) => fetchPlanRuns(householdId, query, { signal }),
    staleTime: STALE_TIME.list,
  });

/** The balance. `networkMode: "offlineFirst"` — the header of `/`, must render offline. */
export const balanceQuery = (householdId: string, query: Partial<BalanceQuery> = {}) =>
  queryOptions({
    queryKey: queryKeys.balance(householdId, query),
    queryFn: ({ signal }) => fetchBalance(householdId, query, { signal }),
    staleTime: STALE_TIME.list,
    networkMode: "offlineFirst",
  });

export const balanceHistoryQuery = (householdId: string, query: Partial<BalanceHistoryQuery> = {}) =>
  queryOptions({
    queryKey: queryKeys.balanceHistory(householdId, query),
    queryFn: ({ signal }) => fetchBalanceHistory(householdId, query, { signal }),
    staleTime: STALE_TIME.list,
  });

export const settlementsQuery = (householdId: string, query: Partial<PaginationQuery> = {}) =>
  queryOptions({
    queryKey: queryKeys.settlements(householdId, query),
    queryFn: ({ signal }) => fetchSettlements(householdId, query, { signal }),
    staleTime: STALE_TIME.list,
  });

/* -------------------------------------------------------------------------- */
/* invalidation helpers                                                       */
/* -------------------------------------------------------------------------- */

export const invalidate = {
  everything: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.all }),
  me: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.me() }),
  sessions: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.sessions() }),
  households: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.households() }),
  /** Everything inside one household (transactions, categories, tags, plan, balance, members). */
  household: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.household(householdId) }),
  householdDetail: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.householdDetail(householdId) }),
  members: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.householdMembers(householdId) }),
  invites: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.householdInvites(householdId) }),
  transactions: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(householdId) }),
  transaction: (qc: QueryClient, householdId: string, transactionId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.transaction(householdId, transactionId) }),
  /**
   * The dashboard's per-category/period totals. A SEPARATE key segment from
   * `"transactions"` (`"transaction-summary"`), so `invalidate.transactions`
   * does NOT reach it — prefix matching is per array element, and
   * `"transaction-summary"` is not `"transactions"`.
   */
  transactionSummary: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "household", householdId, "transaction-summary"] }),
  categories: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "household", householdId, "categories"] }),
  tags: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "household", householdId, "tags"] }),
  plan: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "household", householdId, "plan"] }),
  planRuns: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "household", householdId, "plan-runs"] }),
  balance: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "household", householdId, "balance"] }),
  balanceHistory: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "household", householdId, "balance-history"] }),
  settlements: (qc: QueryClient, householdId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "household", householdId, "settlements"] }),
} as const;

/**
 * After a create/update/delete on a transaction: the balance, the summary
 * (dashboard cards) and the affected categories/tags counts all depend on it,
 * so a single ledger write invalidates all of them together. This is the ONE
 * place that lists the fan-out, so `WEB-TX` and `WEB-SALDO` mutations agree
 * on what a booking touches without importing each other's feature code.
 *
 * Every derived read is listed EXPLICITLY, because none of them is a key
 * prefix of another: `"transaction-summary"`, `"balance-history"` and
 * `"settlements"` each sit on their own key segment, so invalidating
 * `"transactions"` and `"balance"` leaves all three serving pre-mutation data
 * until their staleTime runs out. `useCreateSettlement` funnels through here
 * too — a settlement IS a transaction — which is why the settlements list
 * belongs in the fan-out rather than only at the call site.
 */
export async function invalidateAfterLedgerMutation(qc: QueryClient, householdId: string): Promise<void> {
  await Promise.all([
    invalidate.transactions(qc, householdId),
    invalidate.transactionSummary(qc, householdId),
    invalidate.balance(qc, householdId),
    invalidate.balanceHistory(qc, householdId),
    invalidate.settlements(qc, householdId),
    invalidate.categories(qc, householdId),
    invalidate.tags(qc, householdId),
  ]);
}

/** After a fixed-cost plan run/recalculation: the plan itself, its runs and the ledger. */
export async function invalidateAfterPlanMutation(qc: QueryClient, householdId: string): Promise<void> {
  await Promise.all([
    invalidate.plan(qc, householdId),
    invalidate.planRuns(qc, householdId),
    invalidateAfterLedgerMutation(qc, householdId),
  ]);
}
