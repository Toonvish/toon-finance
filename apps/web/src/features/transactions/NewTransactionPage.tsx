/**
 * `/new` — Erfassen (Tab 3), the most important screen in the app
 * (docs/spec.md §4.5). One-handed on a 390px phone: amount first (the
 * numeric keypad covers the lower half of the screen the moment it has
 * focus), the four-kind picker, description, a collapsed "Mehr Details", and
 * a sticky "Buchen" bar pinned above the tab bar (`.bottom-tabbar`, never
 * `bottom-0` — CLAUDE.md gotcha #15).
 *
 * After booking the user STAYS on `/new`: the form clears (kind excepted),
 * a toast confirms it, and "Rückgängig" deletes the just-created row. The
 * `mutationId` is minted HERE, at the moment of submission — never inside
 * the mutation function, which reruns verbatim on every offline replay
 * (CLAUDE.md gotcha #10).
 */
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useCurrentUser, useOtherMember, useRequiredHouseholdId, useSession } from "@/lib/session";
import { useUnsavedWork } from "@/lib/unsavedWork";
import { clearField, type FieldErrors } from "@/lib/validation";
import {
  createEmptyFormState,
  isFormDirty,
  resolvedBookedAtIso,
  TransactionFormFields,
  type TransactionFormState,
} from "./components/TransactionFormFields";
import { useCreateTransactionMutation, useDeleteTransactionMutation } from "./lib/queries";

export function NewTransactionPage() {
  const t = useT();
  const toast = useToast();
  const householdId = useRequiredHouseholdId();
  const viewer = useCurrentUser();
  const { member: other, isLoading: otherLoading } = useOtherMember();
  const { isOnline } = useSession();

  const [state, setState] = useState<TransactionFormState>(() => createEmptyFormState());
  const [errors, setErrors] = useState<FieldErrors>({});

  const createMutation = useCreateTransactionMutation();
  const deleteMutation = useDeleteTransactionMutation();

  useUnsavedWork(isFormDirty(state));

  function patch(next: Partial<TransactionFormState>) {
    setState((current) => ({ ...current, ...next }));
    for (const key of Object.keys(next)) {
      if (key === "amountCents") setErrors((current) => clearField(current, "amountCents"));
      if (key === "description") setErrors((current) => clearField(current, "description"));
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!other) return;

    const description = state.description.trim();
    const nextErrors: FieldErrors = {};
    if (state.amountCents === null) nextErrors.amountCents = t("transactions.form.amountInvalid");
    else if (state.amountCents === 0) nextErrors.amountCents = t("transactions.form.amountZero");
    if (description.length === 0) nextErrors.description = t("transactions.form.descriptionRequired");
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const mutationId = crypto.randomUUID();
    const wasOnline = isOnline;
    const keptKind = state.kind;

    createMutation.mutate(
      {
        householdId,
        kind: state.kind,
        amountCents: state.amountCents as number,
        description,
        categoryId: state.category?.id ?? null,
        tags: state.tags,
        bookedAt: resolvedBookedAtIso(state),
        mutationId,
        optimistic: { viewerId: viewer.id, otherId: other.userId },
      },
      {
        onSuccess: (created) => {
          toast.toast({
            title: t("transactions.toast.created"),
            variant: "success",
            action: {
              label: t("common.undo"),
              onClick: () => {
                deleteMutation.mutate({ householdId, transactionId: created.id, mutationId: crypto.randomUUID() });
              },
            },
          });
        },
        onError: (error) => toast.fromError(error),
      },
    );

    // The form clears IMMEDIATELY — the request itself may still be queued
    // (offline) or in flight; the screen must not block on it.
    setState(createEmptyFormState(keptKind));
    setErrors({});
    if (!wasOnline) toast.toast({ title: t("transactions.toast.queued") });
  }

  if (otherLoading) return <LoadingBlock />;

  if (!other) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <EmptyState
          icon={<UserPlus />}
          title={t("nav.household")}
          description={t("settings.household.invite")}
          action={
            <Link to="/household" className="w-full">
              <Button fullWidth>{t("settings.household.manage")}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t("transactions.new.title")} />
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5">
        <TransactionFormFields
          householdId={householdId}
          otherName={other.displayName}
          value={state}
          onChange={patch}
          errors={errors}
        />

        <div className="flex-1" />

        <div className="sticky bottom-tabbar -mx-gutter border-t border-line bg-bg/95 px-gutter py-3 backdrop-blur-md lg:mx-0 lg:rounded-b-card">
          <Button type="submit" fullWidth loading={createMutation.isPending}>
            {t("transactions.form.submitCreate")}
          </Button>
        </div>
      </form>
    </div>
  );
}
