import { Link } from "@tanstack/react-router";
import { LogOut, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useHousehold, useLogout, useSession } from "@/lib/session";
import { IconButton } from "@/components/ui/IconButton";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "./nav-items";

/** Desktop sidebar (>= lg). Same destinations as the mobile tab bar, plus `SECONDARY_NAV_ITEMS`. */
export function SideNav() {
  const { user } = useSession();
  const { household } = useHousehold();
  const logout = useLogout();
  const t = useT();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-4 border-r border-line bg-bg-elevated p-4 lg:flex">
      <Link to="/" className="flex items-center gap-2 rounded-xl px-1 py-1.5">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
          <Wallet className="size-5" />
        </span>
        <span className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
          {household?.name ?? "toon-finance"}
        </span>
      </Link>

      <nav aria-label={t("nav.overview")} className="mt-1 flex-1">
        <ul className="flex flex-col gap-1">
          {[...NAV_ITEMS, ...SECONDARY_NAV_ITEMS].map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                activeProps={{
                  className: "bg-brand-soft text-brand-soft-fg hover:bg-brand-soft",
                  "aria-current": "page",
                }}
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("size-5 shrink-0")} strokeWidth={isActive ? 2.3 : 1.9} aria-hidden="true" />
                    {t(item.labelKey)}
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Link to="/settings" className="flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 hover:bg-surface-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-soft-fg"
          >
            {initials(user?.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-fg">{user?.name ?? t("nav.profile")}</span>
            <span className="block truncate text-xs text-fg-muted">{user?.email}</span>
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
