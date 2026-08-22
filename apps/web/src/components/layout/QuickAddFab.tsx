import { Plus } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
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
 * The brand fill, the size and the round shape come from `IconButton`
 * (`variant="brand" size="fab" shape="circle"`) rather than from a second
 * hand-written class list: a colour surface is EXCHANGED, never overlaid, and
 * the primitive is extended when it does not fit yet (CLAUDE.md gotcha #57).
 * Only the fixed positioning belongs to this file.
 *
 * Hidden from `lg` up, where `SideNav`'s primary button does the same job
 * without covering anything — and hidden entirely on the screen that already
 * IS the form (`isAvailable`, see `lib/quick-add.tsx`).
 */
export function QuickAddFab() {
  const t = useT();
  const { open, isAvailable } = useQuickAdd();
  if (!isAvailable) return null;
  return (
    <IconButton
      label={t("transactions.quickAdd.open")}
      icon={<Plus strokeWidth={2.2} aria-hidden="true" />}
      variant="brand"
      size="fab"
      shape="circle"
      onClick={open}
      aria-keyshortcuts="n"
      className="bottom-tabbar fixed right-[max(1rem,env(safe-area-inset-right,0px))] z-40 mb-4 lg:hidden"
    />
  );
}
