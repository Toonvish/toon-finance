import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useQuickAdd } from "@/lib/quick-add";

/**
 * The floating "+" — the phone's entry to `QuickAddDialog`, on every screen.
 *
 * It replaced the "Erfassen" TAB, which cost a navigation and a screen, and
 * it hands the freed fourth tab to Fixkosten (`nav-items.ts`). The two
 * objections a FAB usually earns are answered rather than ignored: it sits in
 * the thumb zone at the bottom RIGHT (not centred, where it would fight the
 * tab bar's own middle target), and it clears the tab bar via
 * `.bottom-tabbar` — `bottom-0` would park it behind the bar, unreachable
 * (CLAUDE.md gotcha #15). It does overlap content while scrolling; that is
 * the price, and the reason the lists keep their amounts on the LEFT of the
 * right edge, never underneath it.
 *
 * Hidden from `lg` up, where `SideNav`'s primary button does the same job
 * without covering anything.
 */
export function QuickAddFab() {
  const t = useT();
  const { open } = useQuickAdd();
  return (
    <button
      type="button"
      onClick={open}
      aria-label={t("transactions.quickAdd.open")}
      aria-keyshortcuts="n"
      className={
        "bottom-tabbar fixed right-[max(1rem,env(safe-area-inset-right,0px))] z-40 mb-4 flex size-14 " +
        "items-center justify-center rounded-full bg-brand text-brand-fg shadow-fab " +
        "transition-[transform,background-color] duration-150 active:scale-95 hover:bg-brand-hover " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
      }
    >
      <Plus className="size-7" strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
