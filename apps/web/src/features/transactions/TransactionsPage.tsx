/**
 * `/transactions` — Buchungen (Tab 2, docs/spec.md §4.4). A single
 * `ActionMenu` in the header (never a row of icon buttons), an always-visible
 * search field, a horizontally scrolling row of active-filter chips, and the
 * grouped-by-day list with "Mehr laden".
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Filter, Pencil, Search, Trash2 } from "lucide-react";
import type { TransactionListQuery, TransactionResponse } from "@toon/shared";
import { PageHeader } from "@/components/layout/AppShell";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, useOtherMember, useRequiredHouseholdId } from "@/lib/session";
import { ActiveFilterChips, TransactionFilterPanel, useUrlTransactionFilters } from "./components/TransactionFilters";
import { TransactionList } from "./components/TransactionList";
import { useCategoriesForPicker, useDeleteTransactionMutation } from "./lib/queries";

export function TransactionsPage() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const householdId = useRequiredHouseholdId();
  const viewer = useCurrentUser();
  const { member: other } = useOtherMember();
  const otherName = other?.displayName ?? "";

  const urlFilters = useUrlTransactionFilters();
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  // Local, non-URL toggles — `TX_FILTER_PARAMS` (router.tsx, [WEB-KERN]) does
  // not declare `includeAggregates`/`payerId`, so these two ActionMenu items
  // from docs/spec.md §4.4 cannot live in the URL yet. See the hand-off note
  // in `components/TransactionFilters.tsx`.
  const [hideAggregates, setHideAggregates] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransactionResponse | null>(null);

  const categoriesQuery = useCategoriesForPicker(householdId);
  const deleteMutation = useDeleteTransactionMutation();

  const categoryLabelById = useMemo(
    () => Object.fromEntries((categoriesQuery.data?.items ?? []).map((category) => [category.id, category.label])),
    [categoriesQuery.data],
  );

  const effectiveQuery: Partial<TransactionListQuery> = {
    ...urlFilters.effectiveQuery,
    includeAggregates: !hideAggregates,
    ...(onlyMine ? { payerId: viewer.id } : {}),
  };

  const headerActions: ActionMenuItem[] = [
    {
      label: t("common.filterReset"),
      onSelect: () => {
        urlFilters.reset();
        setHideAggregates(false);
        setOnlyMine(false);
      },
      disabled: !urlFilters.hasFilters && !hideAggregates && !onlyMine,
    },
    {
      label: t("transactions.filter.hideAggregates"),
      description: hideAggregates ? t("common.yes") : t("common.no"),
      onSelect: () => setHideAggregates((value) => !value),
    },
    {
      label: t("transactions.filter.onlyMine"),
      description: onlyMine ? t("common.yes") : t("common.no"),
      onSelect: () => setOnlyMine((value) => !value),
    },
  ];

  function openDetail(transaction: TransactionResponse) {
    void navigate({ to: "/transactions/$transactionId", params: { transactionId: transaction.id } });
  }

  function rowActions(transaction: TransactionResponse): ActionMenuItem[] {
    if (transaction.origin !== "manual") return [];
    return [
      {
        label: t("common.edit"),
        icon: <Pencil />,
        onSelect: () =>
          void navigate({ to: "/transactions/$transactionId/edit", params: { transactionId: transaction.id } }),
      },
      {
        label: t("common.delete"),
        icon: <Trash2 />,
        variant: "danger",
        onSelect: () => setDeleteTarget(transaction),
      },
    ];
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader title={t("transactions.title")} actions={<ActionMenu items={headerActions} />} />

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            leftIcon={<Search />}
            placeholder={t("common.searchPlaceholder")}
            aria-label={t("common.search")}
            value={urlFilters.searchText}
            onChange={(event) => urlFilters.setSearchText(event.currentTarget.value)}
            containerClassName="flex-1"
          />
          <IconButton
            label={t("transactions.filter.title")}
            icon={<Filter />}
            variant={urlFilters.hasFilters ? "brand" : "surface"}
            onClick={() => setFilterPanelOpen(true)}
          />
        </div>
        <ActiveFilterChips
          urlFilters={urlFilters}
          categoryLabel={urlFilters.filters.categoryId ? (categoryLabelById[urlFilters.filters.categoryId] ?? null) : null}
          otherName={otherName}
        />
      </div>

      <TransactionList
        householdId={householdId}
        viewerId={viewer.id}
        query={effectiveQuery}
        categoryLabelById={categoryLabelById}
        onOpen={openDetail}
        rowActions={rowActions}
        hasActiveFilters={urlFilters.hasFilters || hideAggregates || onlyMine}
        onResetFilters={() => {
          urlFilters.reset();
          setHideAggregates(false);
          setOnlyMine(false);
        }}
        onCreateFirst={() => void navigate({ to: "/new" })}
      />

      <TransactionFilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        householdId={householdId}
        urlFilters={urlFilters}
        otherName={otherName}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          deleteMutation.mutate(
            { householdId, transactionId: target.id, mutationId: crypto.randomUUID() },
            {
              onSuccess: () => toast.success(t("transactions.toast.deleted")),
              onError: (error) => toast.fromError(error),
            },
          );
        }}
        title={t("transactions.deleteConfirm.title")}
        description={
          deleteTarget
            ? t("transactions.deleteConfirm.body", {
                description: deleteTarget.description,
                amount: formatCurrency(deleteTarget.amountCents),
              })
            : undefined
        }
        destructive
      />
    </div>
  );
}
