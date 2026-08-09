import { Wallet } from "lucide-react";
import { useHousehold } from "@/lib/session";

/**
 * Sticky mobile top bar: just the household name, so whoever picks up the
 * phone knows which ledger they are looking at. Hidden from `lg` up, where
 * `SideNav` carries the same information.
 *
 * There is no search/new icon here (unlike a recipe app's top bar) — search
 * lives inside `/transactions`'s filter panel and "Erfassen" is already a
 * tab (docs/spec.md §4.1), so a second entry point would be redundant.
 */
export function TopBar() {
  const { household } = useHousehold();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-safe backdrop-blur-md lg:hidden">
      <div className="flex h-topbar items-center gap-2 px-gutter [--gutter:0.5rem]">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
          <Wallet className="size-5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
          {household?.name ?? "toon-finance"}
        </span>
      </div>
    </header>
  );
}
