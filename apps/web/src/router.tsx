/**
 * Code-based TanStack Router tree (docs/spec.md §4.2). No file-based routing,
 * no codegen.
 *
 * Route map:
 *   public   /login  /register(?invite=)  /password/forgot  /password/reset(?token=)  /invite/$token
 *   guarded  /  /transactions  /transactions/$transactionId  /transactions/$transactionId/edit
 *            /new  /settings  /plan  /categories  /household
 *
 * Screens owned by `WEB-TX`/`WEB-SALDO` are resolved lazily through
 * `lazyPage` (see `lib/lazy-page.tsx`) — the file paths below are the
 * contract those two agents build against. A red typecheck for a missing
 * screen is EXPECTED while they are being built.
 */
import { Link, Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { lazyPage } from "@/lib/lazy-page";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { RequireAuth, RequireHousehold, SessionProvider } from "@/lib/session";
import { buttonClasses } from "@/components/ui/Button";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { InvitePage } from "@/features/auth/InvitePage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Search-param validators return objects with OPTIONAL keys only, so
 * `<Link to="/transactions">` never has to pass a `search` prop.
 */
function pick<Keys extends string>(
  search: Record<string, unknown>,
  keys: readonly Keys[],
): Partial<Record<Keys, string>> {
  const result: Partial<Record<Keys, string>> = {};
  for (const key of keys) {
    const value = optionalString(search[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/**
 * The transaction list's filter/search state. A single constant because
 * `pick()` drops anything not listed here — a new filter needs a line in
 * this array (and in `TransactionFilters.tsx`, `WEB-TX`).
 */
const TX_FILTER_PARAMS = ["from", "to", "kind", "categoryId", "tagIds", "origin", "q", "sort"] as const;

/* -------------------------------------------------------------------------- */
/* root                                                                       */
/* -------------------------------------------------------------------------- */

function RootLayout() {
  // SessionProvider lives inside the router so a 401 can navigate client-side.
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

function NotFoundPage() {
  const t = useT();
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-sm font-semibold tracking-wide text-fg-muted uppercase">404</p>
      <h1 className="text-xl font-semibold text-fg">{t("common.notFoundTitle")}</h1>
      <Link to="/" className={buttonClasses()}>
        {t("common.notFoundAction")}
      </Link>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

/* -------------------------------------------------------------------------- */
/* public routes (statically imported — must render without a session)       */
/* -------------------------------------------------------------------------- */

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  // `reset=1` comes back from a completed password reset ("bitte neu anmelden").
  validateSearch: (search: Record<string, unknown>) => pick(search, ["next", "reset"]),
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  validateSearch: (search: Record<string, unknown>) => pick(search, ["next", "invite"]),
  component: RegisterPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/password/forgot",
  component: ForgotPasswordPage,
});

/**
 * The reset token sits in a QUERY PARAM (`?token=`), not the path — it comes
 * from a mailed link the API mints as `${WEB_ORIGIN}/password/reset?token=…`
 * (docs/ledger-spec.md mail templates share this shape with the invite link,
 * whose token DOES sit in the path; the two differ because a reset token is
 * spent once and a stray `Referer` leak is the whole story here, whereas an
 * invite link is meant to be forwarded).
 */
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/password/reset",
  validateSearch: (search: Record<string, unknown>) => pick(search, ["token"]),
  component: ResetPasswordPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: InvitePage,
});

/* -------------------------------------------------------------------------- */
/* guarded app shell                                                         */
/* -------------------------------------------------------------------------- */

function AppLayout() {
  return (
    <RequireAuth>
      <RequireHousehold>
        <AppShell>
          <Outlet />
        </AppShell>
      </RequireHousehold>
    </RequireAuth>
  );
}

/** Pathless layout route: everything below it requires a session (and, per docs/spec.md §4.2, a household). */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
});

const overviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: lazyPage({
    candidates: ["/src/features/overview/OverviewPage.tsx"],
    exportNames: ["OverviewPage"],
    title: "nav.overview",
  }),
});

const transactionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/transactions",
  validateSearch: (search: Record<string, unknown>) => pick(search, TX_FILTER_PARAMS),
  component: lazyPage({
    candidates: ["/src/features/transactions/TransactionsPage.tsx"],
    exportNames: ["TransactionsPage"],
    title: "nav.transactions",
  }),
});

const transactionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/transactions/$transactionId",
  component: lazyPage({
    candidates: ["/src/features/transactions/TransactionDetailPage.tsx"],
    exportNames: ["TransactionDetailPage"],
    title: "transactions.detail.title",
  }),
});

const transactionEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/transactions/$transactionId/edit",
  component: lazyPage({
    candidates: ["/src/features/transactions/EditTransactionPage.tsx"],
    exportNames: ["EditTransactionPage"],
    title: "transactions.edit.title",
  }),
});

const newTransactionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/new",
  component: lazyPage({
    candidates: ["/src/features/transactions/NewTransactionPage.tsx"],
    exportNames: ["NewTransactionPage"],
    title: "transactions.new.title",
  }),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: lazyPage({
    candidates: ["/src/features/settings/SettingsPage.tsx"],
    exportNames: ["SettingsPage"],
    title: "settings.title",
  }),
});

const planRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/plan",
  component: lazyPage({
    candidates: ["/src/features/plan/PlanPage.tsx"],
    exportNames: ["PlanPage"],
    title: "plan.title",
  }),
});

const categoriesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/categories",
  component: lazyPage({
    candidates: ["/src/features/categories/CategoriesPage.tsx"],
    exportNames: ["CategoriesPage"],
    title: "categories.title",
  }),
});

const householdRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/household",
  component: lazyPage({
    candidates: ["/src/features/household/HouseholdPage.tsx"],
    exportNames: ["HouseholdPage"],
    title: "nav.household",
  }),
});

/* -------------------------------------------------------------------------- */
/* tree + router                                                             */
/* -------------------------------------------------------------------------- */

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  inviteRoute,
  appRoute.addChildren([
    overviewRoute,
    transactionsRoute,
    transactionDetailRoute,
    transactionEditRoute,
    newTransactionRoute,
    settingsRoute,
    planRoute,
    categoriesRoute,
    householdRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadDelay: 80,
  defaultNotFoundComponent: NotFoundPage,
  scrollRestoration: true,
});

export const routes = {
  root: rootRoute,
  login: loginRoute,
  register: registerRoute,
  forgotPassword: forgotPasswordRoute,
  resetPassword: resetPasswordRoute,
  invite: inviteRoute,
  app: appRoute,
  overview: overviewRoute,
  transactions: transactionsRoute,
  transactionDetail: transactionDetailRoute,
  transactionEdit: transactionEditRoute,
  newTransaction: newTransactionRoute,
  settings: settingsRoute,
  plan: planRoute,
  categories: categoriesRoute,
  household: householdRoute,
} as const;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
