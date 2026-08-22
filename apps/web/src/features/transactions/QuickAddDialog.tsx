/**
 * The global "Erfassen" surface (docs/spec.md §4.5, redesigned): a bottom
 * sheet on phones, a centred dialog from `sm` up, opened by the floating "+"
 * on every screen, by the sidebar's primary button, and by `n`.
 *
 * It is the same `TransactionFormFields` the `/new` page renders, in a frame
 * that does not cost a navigation — which is the entire point: the booking
 * you are looking at, the receipt in your hand and the form are on screen at
 * the same time.
 *
 * After a successful submit the sheet STAYS OPEN and the form clears (kind
 * excepted), because receipts arrive in batches; `Abbrechen`/Esc is the only
 * thing that closes it. `⌘/Ctrl + Enter` books from anywhere inside, so the
 * amount field never has to be left to reach the button.
 */
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useQuickAdd } from "@/lib/quick-add";
import { useUnsavedWork } from "@/lib/unsavedWork";
import { TransactionFormFields } from "./components/TransactionFormFields";
import { useCreateTransactionForm } from "./lib/useCreateForm";

/**
 * The footer buttons live in `Dialog`'s footer SLOT, not in a sticky bar
 * inside the scrolling body: the slot already carries the border, the
 * safe-area padding and the sheet's own bottom inset, and a second bar
 * stacked on top of it left a sliver of scrolled content visible below the
 * primary action. They reach the form by id — a `<button form="…">` outside
 * its form is exactly what the attribute is for.
 */
const FORM_ID = "quick-add-form";

export function QuickAddDialog() {
  const t = useT();
  const { isOpen, close } = useQuickAdd();
  const form = useCreateTransactionForm();

  // Only while the sheet is open: a closed sheet holds no unsaved work, and
  // `useCreateTransactionForm` keeps its state across open/close on purpose
  // (re-opening after a mis-tap must not lose a typed amount).
  useUnsavedWork(isOpen && form.isDirty);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    form.submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      form.submit();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={close}
      size="lg"
      title={t("transactions.new.title")}
      description={<span className="hidden lg:inline">{t("transactions.quickAdd.shortcuts")}</span>}
      footer={
        form.hasOther ? (
          <div className="flex w-full items-center gap-2 lg:justify-between">
            <p className="hidden text-sm text-fg-muted lg:block">{t("transactions.quickAdd.staysOpen")}</p>
            <div className="flex flex-1 gap-2 lg:flex-none">
              <Button type="button" variant="outline" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" form={FORM_ID} loading={form.isPending} className="flex-1 lg:flex-none lg:px-8">
                {t("transactions.form.submitCreate")}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {form.isLoadingOther ? (
        <LoadingBlock />
      ) : !form.hasOther ? (
        <InviteFirst onNavigate={close} />
      ) : (
        <form id={FORM_ID} onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex flex-col gap-5 pb-2">
          <TransactionFormFields
            householdId={form.householdId}
            otherName={form.otherName}
            value={form.state}
            onChange={form.patch}
            errors={form.errors}
          />
        </form>
      )}
    </Dialog>
  );
}

/** A one-person household cannot split anything — the only useful action here is the invite. */
function InviteFirst({ onNavigate }: { onNavigate: () => void }) {
  const t = useT();
  return (
    <EmptyState
      icon={<UserPlus />}
      title={t("nav.household")}
      description={t("settings.household.invite")}
      action={
        <Link to="/household" onClick={onNavigate} className="w-full">
          <Button fullWidth>{t("settings.household.manage")}</Button>
        </Link>
      }
    />
  );
}

/**
 * Mounts the dialog only once something has opened it, so the form's
 * category/tag queries do not fire on every screen the shell renders. The
 * component itself is statically imported (never lazy): the capture flow has
 * to work on a cold, offline start, and a lazy chunk is one more thing that
 * can be missing at exactly that moment.
 */
export function QuickAddHost() {
  const { isOpen } = useQuickAdd();
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => {
    if (isOpen) setEverOpened(true);
  }, [isOpen]);
  return everOpened ? <QuickAddDialog /> : null;
}

export default QuickAddDialog;
