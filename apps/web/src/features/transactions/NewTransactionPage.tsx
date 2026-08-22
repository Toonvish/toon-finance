/**
 * `/new` — the full-page frame around the same capture form the global
 * `QuickAddDialog` shows.
 *
 * It is no longer a TAB (`components/layout/nav-items.ts`): the "+" that
 * floats on every screen is how a booking normally gets recorded. The route
 * stays because it is a real, linkable destination — the "Erste Buchung
 * erfassen" empty state on `/transactions` points here, an installed PWA can
 * be launched into it, and a page is the better frame when the sheet would
 * have nothing behind it anyway.
 *
 * Both frames share `useCreateTransactionForm`, so validation, the
 * `mutationId` minting (AT CALL TIME, never inside the mutation function —
 * CLAUDE.md gotcha #10), the clear-and-stay behaviour and the undo toast
 * exist exactly once.
 */
import type { FormEvent } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useQuickAddHostedHere } from "@/lib/quick-add";
import { useUnsavedWork } from "@/lib/unsavedWork";
import { InviteSecondPerson } from "./components/InviteSecondPerson";
import { TransactionFormFields } from "./components/TransactionFormFields";
import { useCreateTransactionForm } from "./lib/useCreateForm";

export function NewTransactionPage() {
  const t = useT();
  const form = useCreateTransactionForm();

  useUnsavedWork(form.isDirty);
  // This screen IS the capture form, so the global "+" / sidebar button / `n`
  // stand down — they would open a SECOND, independent draft over this one.
  useQuickAddHostedHere();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    form.submit();
  }

  if (form.isLoadingOther) return <LoadingBlock />;

  if (!form.hasOther) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <InviteSecondPerson />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t("transactions.new.title")} />
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5">
        <TransactionFormFields
          householdId={form.householdId}
          otherName={form.otherName}
          value={form.state}
          onChange={form.patch}
          errors={form.errors}
        />

        <div className="flex-1" />

        <div className="sticky bottom-tabbar -mx-gutter border-t border-line bg-bg/95 px-gutter py-3 backdrop-blur-md lg:mx-0 lg:rounded-b-card">
          <Button type="submit" fullWidth loading={form.isPending}>
            {t("transactions.form.submitCreate")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default NewTransactionPage;
