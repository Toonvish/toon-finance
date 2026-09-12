import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useHousehold } from "@/lib/session";
import { Logo } from "./Logo";

/**
 * Sticky mobile top bar: just the household name, so whoever picks up the
 * phone knows which ledger they are looking at. Hidden from `lg` up, where
 * `SideNav` carries the same information.
 *
 * There is no search/new icon here (unlike a recipe app's top bar) — search
 * lives inside `/transactions`'s filter panel, and "Erfassen" already has the
 * floating "+" in the thumb zone on every screen (`QuickAddFab`). A "+" up
 * here would be a second entry point to the same sheet, in the corner of the
 * screen a thumb reaches last.
 */
export function TopBar() {
  const { household } = useHousehold();
  const t = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-surface-2 bg-bg/90 pt-safe backdrop-blur-md lg:hidden">
      <div className="flex h-topbar items-center gap-2.5 px-gutter [--gutter:0.75rem]">
        <Logo className="size-8" />
        <span className="min-w-0 flex-1 truncate font-display text-display-md font-medium text-fg">
          {household?.name ?? t("common.appName")}
        </span>
      </div>
    </header>
  );
}
