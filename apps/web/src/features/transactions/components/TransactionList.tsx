/**
 * The transaction list body (docs/spec.md §4.4): grouped by day, "Mehr
 * laden" pagination (never infinite scroll — a list someone is hunting a
 * date in must not move under their finger), and the two distinct empty
 * states (`transactions.empty.*` vs `transactions.emptyFiltered.*`).
 *
 * A day is ONE card with a tinted heading strip and hairline-separated rows,
 * not a stack of individually bordered cards. Both the borders and the
 * per-row date were saying the same thing twice; folding them into the day
 * heading is what buys the density, and the heading earns its line back by
 * carrying the day's TOTAL — the number people actually scan a ledger for.
 *
 * The total is the plain sum of `amountCents`, settlements included: this is
 * "what moved on this day", not "what we consumed". The expenses-only view
 * lives on `/` (`isExpense`, docs/ledger-spec.md §2.3), and mixing the two
 * definitions in one app is how a ledger stops adding up.
 */
import { useEffect, useMemo, useState } from "react";
import { List } from "lucide-react";
import type { TransactionListQuery, TransactionResponse } from "@toon/shared";
import { AmountText } from "@/components/money/AmountText";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import type { ActionMenuItem } from "@/components/ui/ActionMenu";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { formatDayHeading } from "@/lib/format";
import { useTransactions } from "../lib/queries";
import { TransactionRow } from "./TransactionRow";

const PAGE_SIZE = 50;

/** Calendar-day grouping key from an ISO timestamp — items already arrive sorted (`-bookedAt` default), so grouping only has to detect boundaries. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export interface TransactionListProps {
  householdId: string;
  viewerId: string;
  query: Partial<TransactionListQuery>;
  /** `categoryId -> resolved label`, built once by the page from the categories query. */
  categoryLabelById: Record<string, string>;
  onOpen: (transaction: TransactionResponse) => void;
  /** `undefined`/empty array -> no `ActionMenu` on that row (generated rows never get one either way). */
  rowActions?: (transaction: TransactionResponse) => ActionMenuItem[];
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onCreateFirst: () => void;
}

export function TransactionList({
  householdId,
  viewerId,
  query,
  categoryLabelById,
  onOpen,
  rowActions,
  hasActiveFilters,
  onResetFilters,
  onCreateFirst,
}: TransactionListProps) {
  const t = useT();
  const [pageCount, setPageCount] = useState(1);
  const queryKeyId = JSON.stringify(query);

  // A new filter combination restarts pagination — otherwise "load more"
  // clicked under one filter would silently carry over to the next.
  useEffect(() => {
    setPageCount(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKeyId]);

  const result = useTransactions(householdId, { ...query, limit: PAGE_SIZE * pageCount, offset: 0 });

  const groups = useMemo(() => {
    const items = result.data?.items ?? [];
    const map = new Map<string, TransactionResponse[]>();
    for (const item of items) {
      const key = dayKey(item.bookedAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [result.data]);

  if (result.isPending) return <SkeletonList count={8} />;

  if (result.isError) {
    return <ErrorState error={result.error} onRetry={() => void result.refetch()} />;
  }

  const items = result.data.items;
  const total = result.data.total;

  if (items.length === 0) {
    if (hasActiveFilters) {
      return (
        <EmptyState
          icon={<List />}
          title={t("transactions.emptyFiltered.title")}
          action={
            <Button variant="secondary" onClick={onResetFilters}>
              {t("transactions.emptyFiltered.action")}
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={<List />}
        title={t("transactions.empty.title")}
        description={t("transactions.empty.description")}
        action={<Button onClick={onCreateFirst}>{t("transactions.empty.action")}</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([key, dayItems]) => {
        const heading = formatDayHeading(dayItems[0]?.bookedAt);
        const dayTotalCents = dayItems.reduce((sum, item) => sum + item.amountCents, 0);
        return (
          <Card key={key} as="section" padding="none" aria-label={heading} className="overflow-hidden">
            <h2 className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2 text-[0.7rem] font-semibold tracking-wide text-fg-muted uppercase">
              <span className="min-w-0 truncate">{heading}</span>
              <AmountText cents={dayTotalCents} size="sm" className="shrink-0 tracking-normal normal-case" />
            </h2>
            <div className="divide-y divide-line">
              {dayItems.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  viewerId={viewerId}
                  categoryLabel={transaction.categoryId ? (categoryLabelById[transaction.categoryId] ?? null) : null}
                  onOpen={() => onOpen(transaction)}
                  actions={rowActions?.(transaction)}
                />
              ))}
            </div>
          </Card>
        );
      })}

      {items.length < total ? (
        <Button variant="secondary" onClick={() => setPageCount((count) => count + 1)} loading={result.isFetching}>
          {t("common.loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
