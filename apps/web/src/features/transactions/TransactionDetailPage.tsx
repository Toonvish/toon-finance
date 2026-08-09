/**
 * `/transactions/$transactionId` (docs/spec.md §4.4). Shows every field the
 * wire carries, including the derived ones (`otherShareCents` /
 * `payerShareCents` / `balanceDeltaCents`) so nothing is re-derived
 * client-side. Only a `manual` row gets "Bearbeiten"/"Löschen" — a generated
 * one shows `transactions.generatedHint` and a link to `/plan` instead
 * (docs/spec.md §4.4, "Automatisch erzeugte Monatsbuchungen").
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { projectKind } from "@toon/shared";
import { AmountText } from "@/components/money/AmountText";
import { OriginBadge } from "@/components/money/KindBadge";
import { PageHeader } from "@/components/layout/AppShell";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { useCurrentUser, useHousehold, useOtherMember, useRequiredHouseholdId } from "@/lib/session";
import { TX_KIND_HINT_KEYS, TX_KIND_LABEL_KEYS, translateKind } from "./lib/kinds";
import { useCategoriesForPicker, useDeleteTransactionMutation, useTransaction } from "./lib/queries";

export function TransactionDetailPage() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { transactionId } = useParams({ strict: false }) as { transactionId: string };
  const householdId = useRequiredHouseholdId();
  const viewer = useCurrentUser();
  const { memberSlot } = useHousehold();
  const { member: other } = useOtherMember();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const transactionQuery = useTransaction(householdId, transactionId);
  const categoriesQuery = useCategoriesForPicker(householdId);
  const deleteMutation = useDeleteTransactionMutation();

  if (transactionQuery.isPending) return <LoadingBlock />;
  if (transactionQuery.isError) {
    return <ErrorState error={transactionQuery.error} onRetry={() => void transactionQuery.refetch()} />;
  }

  const tx = transactionQuery.data;
  const isManual = tx.origin === "manual";
  const kind = projectKind({ payerId: tx.payerId, splitMode: tx.splitMode }, viewer.id);
  const paidByViewer = tx.payerId === viewer.id;
  const ownShareCents = paidByViewer ? tx.payerShareCents : tx.otherShareCents;
  const theirShareCents = paidByViewer ? tx.otherShareCents : tx.payerShareCents;
  const viewerBalanceDelta = memberSlot === 2 ? -tx.balanceDeltaCents : tx.balanceDeltaCents;
  const otherName = other?.displayName ?? "";
  const category = tx.categoryId
    ? (categoriesQuery.data?.items.find((item) => item.id === tx.categoryId) ?? null)
    : null;
  const createdByName =
    tx.createdBy === null ? null : tx.createdBy === viewer.id ? viewer.name : (other?.displayName ?? null);

  function goBack() {
    void navigate({ to: "/transactions" });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader
        title={t("transactions.detail.title")}
        actions={
          isManual ? (
            <ActionMenu
              items={[
                {
                  label: t("common.edit"),
                  icon: <Pencil />,
                  onSelect: () => void navigate({ to: "/transactions/$transactionId/edit", params: { transactionId } }),
                },
                {
                  label: t("common.delete"),
                  icon: <Trash2 />,
                  variant: "danger",
                  onSelect: () => setDeleteOpen(true),
                },
              ]}
            />
          ) : (
            <OriginBadge origin={tx.origin} />
          )
        }
      />

      <Card className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-fg">{tx.description}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {tx.dateSource === "estimated" ? "~ " : ""}
              {formatDate(tx.bookedAt)}
              {tx.dateSource === "estimated" ? ` · ${t("transactions.dateEstimated")}` : ""}
            </p>
          </div>
          <AmountText cents={tx.amountCents} size="xl" />
        </div>

        {kind ? (
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-muted">
            {translateKind(t, TX_KIND_HINT_KEYS[kind], { name: otherName })}
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-fg-muted">{t("common.category")}</dt>
            <dd className="mt-0.5 font-medium text-fg">{category?.label ?? t("transactions.form.categoryNone")}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t("transactions.form.kind")}</dt>
            <dd className="mt-0.5 font-medium text-fg">
              {kind ? translateKind(t, TX_KIND_LABEL_KEYS[kind], { name: otherName }) : "—"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-fg-muted">{t("transactions.detail.balanceEffect")}</dt>
            <dd className="mt-0.5">
              <AmountText cents={viewerBalanceDelta} showPlusSign size="sm" />
            </dd>
          </div>
        </dl>

        <ul className="flex flex-col gap-1 text-sm text-fg-muted">
          <li>{paidByViewer ? t("transactions.paidByYou") : t("transactions.paidBy", { name: otherName })}</li>
          <li>{t("transactions.yourShare", { amount: formatCurrency(ownShareCents) })}</li>
          <li>{t("transactions.theirShare", { name: otherName, amount: formatCurrency(theirShareCents) })}</li>
        </ul>

        {tx.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tx.tags.map((tag) => (
              <Badge key={tag.id} size="sm">
                {tag.name}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-0.5 border-t border-line pt-3 text-xs text-fg-muted">
          {createdByName ? <p>{t("transactions.detail.createdBy", { name: createdByName })}</p> : null}
          <p>{t("transactions.detail.createdAt", { date: formatDateTime(tx.createdAt) })}</p>
        </div>
      </Card>

      {!isManual ? (
        <Card>
          <p className="text-sm text-fg-muted">{t("transactions.generatedHint")}</p>
          <Link to="/plan" className="mt-3 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline">
            {t("nav.plan")}
          </Link>
        </Card>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await new Promise<void>((resolve, reject) => {
            deleteMutation.mutate(
              { householdId, transactionId, mutationId: crypto.randomUUID() },
              {
                onSuccess: () => {
                  toast.success(t("transactions.toast.deleted"));
                  resolve();
                  goBack();
                },
                onError: (error) => {
                  toast.fromError(error);
                  reject(error);
                },
              },
            );
          });
        }}
        title={t("transactions.deleteConfirm.title")}
        description={t("transactions.deleteConfirm.body", {
          description: tx.description,
          amount: formatCurrency(tx.amountCents),
        })}
        destructive
      />
    </div>
  );
}
