import { List, Repeat, Tags, User, Users, Wallet, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/I18nProvider.tsx";

export interface NavItem {
  to: "/" | "/transactions" | "/new" | "/settings" | "/plan" | "/categories" | "/household";
  /**
   * A catalog key, not a translated string — a label resolved at import time
   * would freeze the tab bar and the sidebar on whichever locale loaded
   * first (docs/spec.md §4.1).
   */
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Only `/` matches exactly; the rest match their subtree. */
  exact: boolean;
}

/**
 * The primary destinations — bottom tab bar on phones, sidebar HEAD from `lg`
 * up (docs/spec.md §4.1).
 *
 * "Erfassen" is NO LONGER a tab. It is a floating "+" that sits on every
 * screen (`QuickAddFab` -> `QuickAddDialog`) and opens the whole form as one
 * sheet, so capturing a booking never costs a navigation and never leaves the
 * screen you were reading. The freed fourth tab goes to **Fixkosten**, which
 * used to be sidebar-only and therefore one card-tap deep on a phone — the
 * plan is the reason this app exists, so it earns a permanent target.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", labelKey: "nav.overview", icon: Wallet, exact: true },
  { to: "/transactions", labelKey: "nav.transactions", icon: List, exact: false },
  { to: "/plan", labelKey: "nav.plan", icon: Repeat, exact: false },
  { to: "/settings", labelKey: "nav.profile", icon: User, exact: false },
];

/**
 * Sidebar-only destinations. There is NO sidebar below `lg`, so every one of
 * these must also be reachable from a `NAV_ITEMS` screen — see the cards
 * named in docs/spec.md §4.1: the `categories.manage` footer link in
 * `SpendByCategoryCard` on `/` (and the same link in the category sheet of
 * the quick-add form), and `HouseholdCard` on `/settings`.
 */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { to: "/categories", labelKey: "nav.categories", icon: Tags, exact: false },
  { to: "/household", labelKey: "nav.household", icon: Users, exact: false },
];
