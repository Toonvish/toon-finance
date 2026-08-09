/**
 * Offline mutation defaults for the ledger writes made from `/new` and
 * `/transactions/$id/edit` — the WRITE half of "Erfassen funktioniert
 * offline" (docs/spec.md §1.2 point 6 and §4.5, CLAUDE.md gotchas #7-#10).
 *
 * Imported once for its SIDE EFFECT from `app.tsx`, BEFORE the persister
 * restores any paused mutation: a dehydrated mutation keeps its `variables`
 * but not its `mutationFn` (a function cannot be serialised), so
 * `resumePausedMutations()` needs these defaults registered on the exact
 * `mutationKey` a restored mutation carries, or it has nothing to run.
 *
 * `features/transactions/lib/queries.ts` (also `WEB-TX`) supplies ONLY the
 * `mutationKey` to `useMutation` — never a `mutationFn` — so a fresh
 * in-session booking and a replayed offline one run the exact same function.
 *
 * `mutationId` is minted by the CALLER (`NewTransactionPage`/
 * `EditTransactionPage`) at the moment the user taps "Buchen"/"Speichern",
 * never inside a `mutationFn` here — this file's functions rerun verbatim on
 * every replay, so anything coined inside them would mint a new id on every
 * retry and defeat `mutation_claims` (docs/spec.md §2.9, CLAUDE.md gotcha #10).
 */
import type { QueryClient } from "@tanstack/react-query";
import {
  deltaForTransaction,
  halfForOther,
  kindToStorage,
  type CreateTransactionRequest,
  type TransactionResponse,
  type UpdateTransactionRequest,
} from "@toon/shared";
import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/api";
import { invalidate, invalidateAfterLedgerMutation, queryKeys, shouldRetry } from "@/lib/queries";
import { queryClient as appQueryClient } from "@/lib/query-client";

/**
 * Mutation-key namespace. `key[1] === "tx"` is what `lib/persist.ts`'s
 * `shouldPersistMutation` allow-list matches on — the namespace itself must
 * stay exactly `"tx"`, the third segment is free.
 */
export const TX_MUTATION_KEYS = {
  create: ["toon", "tx", "create"] as const,
  update: ["toon", "tx", "update"] as const,
  remove: ["toon", "tx", "remove"] as const,
} as const;

/**
 * The household id travels IN THE VARIABLES, not baked into the mutation
 * key: `setMutationDefaults` runs once at module load, long before a session
 * (and therefore a household) exists, and a household-scoped key would leave
 * a restored mutation from a previous login with no matching default.
 */
export interface CreateTransactionVariables extends CreateTransactionRequest {
  householdId: string;
  /** Minted at the call site — see the file doc. Required here (unlike the wire type) so a queued booking always has one. */
  mutationId: string;
  /** Needed only for the optimistic cache patch below; never sent to the server. */
  optimistic: OptimisticContext;
}

export interface UpdateTransactionVariables extends UpdateTransactionRequest {
  householdId: string;
  transactionId: string;
  mutationId: string;
}

export interface DeleteTransactionVariables {
  householdId: string;
  transactionId: string;
  mutationId: string;
}

/**
 * What the optimistic patch needs to render a plausible row before the
 * server has seen it: the viewer/other ids (to run the same `kindToStorage`
 * projection the server runs) and the other person's display name (for
 * `categorySlug`-free, tag-free display — the row backfills those on the
 * next successful fetch).
 */
export interface OptimisticContext {
  viewerId: string;
  otherId: string;
}

function buildOptimisticTransaction(
  variables: CreateTransactionVariables,
  nowIso: string,
): TransactionResponse {
  const { payerId, splitMode } = kindToStorage(
    variables.kind,
    variables.optimistic.viewerId,
    variables.optimistic.otherId,
  );
  const amountCents = variables.amountCents;
  const otherShareCents = splitMode === "SPLIT_EQUAL" ? halfForOther(amountCents) : amountCents;
  const payerShareCents = amountCents - otherShareCents;
  // Optimistic-only approximation: the real `balanceDeltaCents` is relative
  // to member_slot 1, which this file cannot resolve without a household
  // fetch. Rendered for at most a few hundred ms, until the server response
  // (or the next `invalidateAfterLedgerMutation`) replaces this row outright.
  const balanceDeltaCents = deltaForTransaction({ payerId, splitMode, amountCents }, variables.optimistic.viewerId);

  return {
    id: `optimistic:${variables.mutationId}`,
    householdId: variables.householdId,
    payerId,
    splitMode,
    amountCents,
    description: variables.description,
    categoryId: variables.categoryId ?? null,
    categorySlug: null,
    tags: (variables.tags ?? []).map((name) => ({ id: `optimistic-tag:${name}`, name })),
    bookedAt: variables.bookedAt ?? nowIso,
    dateSource: "exact",
    origin: "manual",
    planPeriod: null,
    createdBy: variables.optimistic.viewerId,
    createdAt: nowIso,
    updatedAt: nowIso,
    otherShareCents,
    payerShareCents,
    balanceDeltaCents,
    isExpense: splitMode !== "SETTLEMENT",
  };
}

/** Prepends `tx` to every cached transaction LIST page of this household (not the detail cache — there is no detail id yet). */
function patchListsWithOptimisticRow(client: QueryClient, householdId: string, tx: TransactionResponse): void {
  client.setQueriesData<{ items: TransactionResponse[]; total: number; limit: number; offset: number } | undefined>(
    { queryKey: queryKeys.transactionsRoot(householdId) },
    (current) => {
      if (!current) return current;
      return { ...current, items: [tx, ...current.items], total: current.total + 1 };
    },
  );
}

function removeOptimisticRow(client: QueryClient, householdId: string, optimisticId: string): void {
  client.setQueriesData<{ items: TransactionResponse[]; total: number; limit: number; offset: number } | undefined>(
    { queryKey: queryKeys.transactionsRoot(householdId) },
    (current) => {
      if (!current) return current;
      if (!current.items.some((item) => item.id === optimisticId)) return current;
      return {
        ...current,
        items: current.items.filter((item) => item.id !== optimisticId),
        total: Math.max(0, current.total - 1),
      };
    },
  );
}

/**
 * Registers the three mutation defaults on `client` (the app's single
 * `QueryClient` by default). Idempotent to call twice — `setMutationDefaults`
 * simply overwrites — which matters because Vite's dev server can re-run
 * this module on a hot reload.
 */
export function registerTransactionMutationDefaults(client: QueryClient = appQueryClient): void {
  client.setMutationDefaults(TX_MUTATION_KEYS.create, {
    mutationFn: (variables: CreateTransactionVariables) => {
      const { householdId, optimistic: _optimistic, ...body } = variables;
      return createTransaction(householdId, body);
    },
    networkMode: "offlineFirst",
    // NOT `false` (the QueryClient's global mutation default): `retry:
    // false` skips the retryer's pause-while-offline branch entirely (see
    // `@tanstack/query-core`'s `createRetryer` — it only ever pauses INSIDE
    // a retry attempt), so an offline write would fail immediately instead
    // of queueing. `shouldRetry` (the same policy `lib/queries.ts` uses for
    // reads) never retries a real 4xx, which is what keeps a genuine
    // validation error from being retried forever.
    retry: shouldRetry,
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey: queryKeys.transactionsRoot(variables.householdId) });
      const optimisticTx = buildOptimisticTransaction(variables, new Date().toISOString());
      patchListsWithOptimisticRow(client, variables.householdId, optimisticTx);
      return { optimisticId: optimisticTx.id };
    },
    onError: (_error, variables, context) => {
      const optimisticId = (context as { optimisticId?: string } | undefined)?.optimisticId;
      if (optimisticId) removeOptimisticRow(client, variables.householdId, optimisticId);
    },
    onSuccess: async (_data, variables, context) => {
      const optimisticId = (context as { optimisticId?: string } | undefined)?.optimisticId;
      if (optimisticId) removeOptimisticRow(client, variables.householdId, optimisticId);
      await invalidateAfterLedgerMutation(client, variables.householdId);
    },
  });

  client.setMutationDefaults(TX_MUTATION_KEYS.update, {
    mutationFn: (variables: UpdateTransactionVariables) => {
      const { householdId, transactionId, ...body } = variables;
      return updateTransaction(householdId, transactionId, body);
    },
    networkMode: "offlineFirst",
    retry: shouldRetry, // see the CREATE default above for why not `false`
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidate.transaction(client, variables.householdId, variables.transactionId),
        invalidateAfterLedgerMutation(client, variables.householdId),
      ]);
    },
  });

  client.setMutationDefaults(TX_MUTATION_KEYS.remove, {
    mutationFn: (variables: DeleteTransactionVariables) =>
      deleteTransaction(variables.householdId, variables.transactionId, variables.mutationId),
    networkMode: "offlineFirst",
    retry: shouldRetry, // see the CREATE default above for why not `false`
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey: queryKeys.transactionsRoot(variables.householdId) });
      removeOptimisticRow(client, variables.householdId, variables.transactionId);
    },
    onSuccess: async (_data, variables) => {
      await invalidateAfterLedgerMutation(client, variables.householdId);
    },
  });
}

// Side effect: registers against the app's singleton QueryClient the moment
// this module is imported (see the file doc for why the timing matters).
registerTransactionMutationDefaults();
