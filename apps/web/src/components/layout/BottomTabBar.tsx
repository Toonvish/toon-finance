import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { NAV_ITEMS } from "./nav-items";

/**
 * Fixed bottom tab bar for phones (hidden from `lg` up, where the sidebar
 * takes over). Every tab is a >=56px tall touch target and respects the
 * home-indicator inset (`pb-safe`).
 *
 * Tabs share the width via `flex-1` and their labels truncate rather than
 * wrap — a wrapped label would make one tab taller than its neighbours. See
 * `nav-items.ts` for why there are exactly four, and why "Erfassen" is NOT
 * one of them any more: it is the floating "+" (`QuickAddFab`) that sits on
 * every screen, and the tab it freed went to Fixkosten.
 */
export function BottomTabBar() {
  const t = useT();
  return (
    <nav
      aria-label={t("nav.overview")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur-md lg:hidden"
    >
      <ul className="flex items-stretch justify-around px-safe">
        {NAV_ITEMS.map((item) => (
          <li key={item.to} className="min-w-0 flex-1">
            <Link
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="group flex h-tabbar flex-col items-center justify-center gap-1 px-0.5 text-fg-muted transition-colors duration-150"
              activeProps={{ className: "text-brand", "aria-current": "page" }}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-7 w-10 items-center justify-center rounded-full transition-colors duration-150",
                      isActive && "bg-brand-soft",
                    )}
                  >
                    <item.icon className="size-5" strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                  </span>
                  <span className={cn("max-w-full truncate text-[0.68rem] leading-none", isActive && "font-semibold")}>
                    {t(item.labelKey)}
                  </span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
