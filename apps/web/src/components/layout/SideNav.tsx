import { Link } from "@tanstack/react-router";
import { LogOut, Plus } from "lucide-react";
import { initials } from "@/lib/format";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useQuickAdd } from "@/lib/quick-add";
import { useHousehold, useLogout, useSession } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Logo } from "./Logo";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "./nav-items";

/**
 * Desktop sidebar (>= lg). Same destinations as the mobile tab bar, plus
 * `SECONDARY_NAV_ITEMS`, and above them the primary "Erfassen" button — the
 * desktop counterpart of the phone's floating "+", opening the same
 * `QuickAddDialog`. It sits ABOVE the nav list, because it is an action, not
 * a destination; the `N` hint is the shortcut `lib/quick-add.tsx` binds.
 *
 * Chrome follows toon-recipe's sidebar: `w-sidebar` (236px, paired with
 * `lg:pl-sidebar` on AppShell), `bg-bg-sunken` — one step BELOW `--bg`, not
 * `bg-bg-elevated`, which in dark mode is lighter than the page and would invert
 * the intended depth — and `border-surface-2` for every internal divider. The
 * secondary destinations sit under an `.eyebrow` section label.
 */
export function SideNav() {
  const { user } = useSession();
  const { household } = useHousehold();
  const logout = useLogout();
  const quickAdd = useQuickAdd();
  const t = useT();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col gap-[22px] border-r border-surface-2 bg-bg-sunken px-3.5 py-5 lg:flex">
      <Link to="/" className="flex items-center gap-2.5 px-1.5">
        <Logo className="size-8" />
        <span className="min-w-0 truncate font-display text-display-md font-medium text-fg">
          {household?.name ?? t("common.appName")}
        </span>
      </Link>

      {/* Hidden on the screen that already IS the capture form (`/new`) —
          opening the sheet there would lay a second, independent draft over
          the one being typed into (see `lib/quick-add.tsx`). */}
      {quickAdd.isAvailable ? (
        <Button
          fullWidth
          onClick={quickAdd.open}
          aria-keyshortcuts="n"
          leftIcon={<Plus className="size-4" strokeWidth={2.4} aria-hidden="true" />}
        >
          {t("nav.create")}
          <kbd aria-hidden="true" className="ml-1 text-xs font-medium text-brand-fg/65">
            N
          </kbd>
        </Button>
      ) : null}

      <nav aria-label={t("nav.overview")}>
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                activeProps={{
                  className: "bg-brand-soft text-brand-soft-fg hover:bg-brand-soft",
                  "aria-current": "page",
                }}
              >
                {({ isActive }) => (
                  <>
                    <item.icon className="size-[18px] shrink-0" strokeWidth={isActive ? 2.3 : 2} aria-hidden="true" />
                    {t(item.labelKey)}
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-surface-2 pt-3.5">
        <span className="eyebrow px-3 pb-1.5 text-fg-faint">{t("nav.manage")}</span>
        <nav aria-label={t("nav.manage")}>
          <ul className="flex flex-col gap-0.5">
            {SECONDARY_NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="flex items-center gap-3 rounded-control px-3 py-2 text-control font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                  activeProps={{
                    className: "bg-brand-soft text-brand-soft-fg hover:bg-brand-soft",
                    "aria-current": "page",
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className="size-4 shrink-0" strokeWidth={isActive ? 2.3 : 2} aria-hidden="true" />
                      {t(item.labelKey)}
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-surface-2 px-2 py-2.5">
        <Link to="/settings" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-brand-fg"
          >
            {initials(user?.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.81rem] font-semibold text-fg">{user?.name ?? t("nav.profile")}</span>
            <span className="block truncate text-[0.72rem] text-fg-subtle">{user?.email}</span>
          </span>
        </Link>
        <IconButton
          label={t("auth.logout")}
          icon={<LogOut />}
          loading={logout.isPending}
          onClick={() => logout.mutate()}
        />
      </div>
    </aside>
  );
}
