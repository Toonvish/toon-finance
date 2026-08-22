/**
 * Everything "erfasse eine Buchung" does, minus the frame around it.
 *
 * Two frames render it: the global `QuickAddDialog` (the "+" on every screen)
 * and the full-page `/new` fallback. They differ in chrome — a sheet footer
 * versus a sticky "Buchen" bar — and in nothing else, so the validation, the
 * `mutationId` minting, the optimistic clear and the undo toast live here
 * instead of being written twice and drifting.
 *
 * The `mutationId` is minted AT CALL TIME, never inside the mutation
 * function, which reruns verbatim on every offline replay (CLAUDE.md
 * gotcha #10).
 */
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useCurrentUser, useOtherMember, useRequiredHouseholdId, useSession } from "@/lib/session";
import { clearField, type FieldErrors } from "@/lib/validation";
import {
  createEmptyFormState,
  isFormDirty,
  resolvedBookedAtIso,
  type TransactionFormState,
} from "../components/TransactionFormFields";
import { useCreateTransactionMutation, useDeleteTransactionMutation } from "./queries";

export interface CreateTransactionForm {
  householdId: string;
  state: TransactionFormState;
  errors: FieldErrors;
  patch: (next: Partial<TransactionFormState>) => void;
  /** Validates, books, and clears the form. `true` when the booking was actually submitted. */
  submit: () => boolean;
  isPending: boolean;
  isDirty: boolean;
  /** `null` while loading, and `null` for a one-person household — the caller shows the invite prompt. */
  otherName: string | null;
  hasOther: boolean;
  isLoadingOther: boolean;
}

export function useCreateTransactionForm(): CreateTransactionForm {
  const t = useT();
  const toast = useToast();
  const householdId = useRequiredHouseholdId();
  const viewer = useCurrentUser();
  const { member: other, isLoading: isLoadingOther } = useOtherMember();
  const { isOnline } = useSession();

  const [state, setState] = useState<TransactionFormState>(() => createEmptyFormState());
  const [errors, setErrors] = useState<FieldErrors>({});

  const createMutation = useCreateTransactionMutation();
  const deleteMutation = useDeleteTransactionMutation();

  function patch(next: Partial<TransactionFormState>) {
    setState((current) => ({ ...current, ...next }));
    for (const key of Object.keys(next)) {
      if (key === "amountCents") setErrors((current) => clearField(current, "amountCents"));
      if (key === "description") setErrors((current) => clearField(current, "description"));
    }
  }

  function submit(): boolean {
    if (!other) return false;

    const description = state.description.trim();
    const nextErrors: FieldErrors = {};
    if (state.amountCents === null) nextErrors.amountCents = t("transactions.form.amountInvalid");
    else if (state.amountCents === 0) nextErrors.amountCents = t("transactions.form.amountZero");
    if (description.length === 0) nextErrors.description = t("transactions.form.descriptionRequired");
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return false;
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
    return true;
  }

  return {
    householdId,
    state,
    errors,
    patch,
    submit,
    isPending: createMutation.isPending,
    isDirty: isFormDirty(state),
    otherName: other?.displayName ?? null,
    hasOther: other !== null,
    isLoadingOther,
  };
}
