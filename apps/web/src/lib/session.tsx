/**
 * Session + active-household context.
 *
 *  - `useSession()`      — current user, household, loading/auth/online flags.
 *  - `useCurrentUser()`  — the user, or throws inside guarded routes (never null there).
 *  - `useHousehold()`    — the (single, practically-only) household + the viewer's slot.
 *  - `useOtherMember()`  — the other person's `MemberResponse`, for `{name}` everywhere.
 *  - `useLogin()/useRegister()/useLogout()` — mutations that keep the cache in sync.
 *  - `<RequireAuth>`     — route guard, redirects to `/login?next=…`.
 *  - `<RequireHousehold>`— for household-scoped screens (docs/spec.md §4.2).
 *
 * There is no household SWITCHER: `MeResponse.activeHouseholdId` is simply
 * the first (and practically only) entry (docs/spec.md §3.5) — this app has
 * exactly two people in exactly one household, almost always.
 *
 * The provider lives INSIDE the router (root route) so it can navigate on a 401.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import type {
  AuthSessionResponse,
  HouseholdSummary,
  LoginRequest,
  MemberResponse,
  MemberSlot,
  MeResponse,
  RegisterRequest,
  UserResponse,
} from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import {
  createHousehold,
  loginWithPassword,
  logout as logoutRequest,
  registerAccount,
  setUnauthorizedHandler,
} from "./api";
import { safeNextPath } from "./navigation";
import { purgePersistedCache, setActiveCacheUser } from "./persist";
import { useOnlineStatus } from "./pwa";
import { householdMembersQuery, invalidate, meQuery, queryKeys } from "./queries";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { FullPageLoader } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";

export interface SessionContextValue {
  user: UserResponse | null;
  household: HouseholdSummary | null;
  /** True while the bootstrap request is in flight (first load only). */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Bootstrap failure (server down) — a 401 is NOT an error. */
  error: unknown;
  refetch: () => Promise<unknown>;

  /**
   * False while the device reports no connection. Screens use it to disable
   * writes before they fail.
   */
  isOnline: boolean;
  /**
   * True when the user/balance on screen come from the persisted offline
   * cache and the server could not be reached to confirm them.
   */
  isOfflineData: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const meResult = useQuery(meQuery());
  const isOnline = useOnlineStatus();

  const me: MeResponse | null = meResult.data ?? null;
  const user = me?.user ?? null;
  const household = useMemo<HouseholdSummary | null>(() => {
    if (!me) return null;
    return me.households.find((h) => h.id === me.activeHouseholdId) ?? me.households[0] ?? null;
  }, [me]);

  /**
   * Keep the offline cache pointed at the account on screen — the data-leak
   * guard from `lib/persist.ts`: the id decides which IndexedDB blob is
   * written, and a change purges the store, so a second person on the same
   * shared tablet can never restore the first one's ledger. Runs as an
   * effect (not in render) because it performs I/O.
   */
  useEffect(() => {
    if (user) setActiveCacheUser(user.id);
  }, [user]);

  /**
   * `data` from the persisted cache plus a failed refetch = we are showing
   * what the device already had. That is the honest signal for "read-only
   * right now" — a plain `navigator.onLine === false` also covers the
   * captive-wifi case where the browser thinks it is online and every
   * request still fails.
   */
  const isOfflineData = user !== null && (!isOnline || meResult.isError);

  // A 401 from any endpoint sends the user to the login screen (client-side).
  useEffect(() => {
    setUnauthorizedHandler((next) => {
      queryClient.setQueryData(queryKeys.me(), null);
      void navigate({ to: "/login", search: { next }, replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      household,
      isLoading: meResult.isPending,
      isAuthenticated: user !== null,
      error: meResult.error,
      refetch: () => meResult.refetch(),
      isOnline,
      isOfflineData,
    }),
    [user, household, meResult.isPending, meResult.error, meResult.refetch, isOnline, isOfflineData],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return context;
}

/** Inside `<RequireAuth>` the user is guaranteed — use this to avoid null checks. */
export function useCurrentUser(): UserResponse {
  const { user } = useSession();
  if (!user) throw new Error("useCurrentUser may only be used inside a protected route.");
  return user;
}

export interface HouseholdValue {
  /** Null only in the rare `household_required` bootstrap state. */
  householdId: string | null;
  household: HouseholdSummary | null;
  memberSlot: MemberSlot | null;
}

export function useHousehold(): HouseholdValue {
  const { household } = useSession();
  return {
    householdId: household?.id ?? null,
    household,
    memberSlot: household?.memberSlot ?? null,
  };
}

/**
 * Same as {@link useHousehold} but the id is non-null — only valid below
 * `<RequireHousehold>`, which is exactly where the ledger screens live.
 */
export function useRequiredHouseholdId(): string {
  const { householdId } = useHousehold();
  if (!householdId) {
    throw new Error("No household — <RequireHousehold> is missing around this route.");
  }
  return householdId;
}

/**
 * The OTHER household member's `MemberResponse` — the source of every
 * `{name}` placeholder in the app (`transactions.kind.forThem.label`,
 * `balance.owesYou`, …). Loads the members list lazily; while it is loading
 * or the household has only one member so far, `member` is `null` and
 * callers fall back to a generic label.
 */
export function useOtherMember(): { member: MemberResponse | null; isLoading: boolean } {
  const { householdId, memberSlot } = useHousehold();
  const query = useQuery({
    ...householdMembersQuery(householdId ?? ""),
    enabled: householdId !== null,
  });
  const member = useMemo(() => {
    if (!query.data || memberSlot === null) return null;
    return query.data.items.find((item) => item.memberSlot !== memberSlot) ?? null;
  }, [query.data, memberSlot]);
  return { member, isLoading: query.isPending };
}

/* -------------------------------------------------------------------------- */
/* auth mutations                                                             */
/* -------------------------------------------------------------------------- */

/** Builds a `MeResponse`-shaped cache entry from an auth response, for an instant UI without waiting on a refetch. */
function toMeResponse(data: AuthSessionResponse): MeResponse {
  return {
    user: data.user,
    households: data.household ? [data.household] : [],
    activeHouseholdId: data.household?.id ?? null,
  };
}

function useAuthSuccessHandler() {
  const queryClient = useQueryClient();
  return useCallback(
    (data: AuthSessionResponse) => {
      queryClient.setQueryData(queryKeys.me(), toMeResponse(data));
      void invalidate.me(queryClient);
    },
    [queryClient],
  );
}

export function useLogin() {
  const onAuthenticated = useAuthSuccessHandler();
  return useMutation<AuthSessionResponse, unknown, LoginRequest>({
    mutationFn: (body) => loginWithPassword(body),
    onSuccess: onAuthenticated,
  });
}

export function useRegister() {
  const onAuthenticated = useAuthSuccessHandler();
  return useMutation<AuthSessionResponse, unknown, RegisterRequest>({
    mutationFn: (body) => registerAccount(body),
    onSuccess: onAuthenticated,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation<void, unknown, void>({
    mutationFn: () => logoutRequest(),
    // `onSettled`, not `onSuccess`: if the logout request itself fails
    // (offline, server down) the local state must still be gone. Leaving a
    // persisted cache behind on a phone whose owner just tapped "Abmelden"
    // is the exact failure this feature must not introduce.
    onSettled: async () => {
      queryClient.setQueryData(queryKeys.me(), null);
      queryClient.clear();
      // Drops the IndexedDB blob AND the lastUserId pointer, so the next
      // start has nothing to restore and no id to restore it under.
      setActiveCacheUser(null);
      await purgePersistedCache();
      await navigate({ to: "/login", replace: true });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* guards                                                                     */
/* -------------------------------------------------------------------------- */

/** Redirects to `/login?next=<current url>` when there is no session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, error, refetch } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const redirecting = useRef(false);
  const t = useT();

  /**
   * AT MOST ONE REDIRECT PER MOUNT — the ref is the whole point.
   *
   * `useLocation()` flips to the new URL the moment `navigate()` touches
   * history, while THIS tree is still rendered. So an effect keyed on
   * `location.href` fires again with `/login?next=%2F` already in hand and
   * folds it into the next redirect, growing on every pass. `safeNextPath`
   * is the second, independent stop: it rejects any target that itself
   * starts with `/login`, so the parameter can never nest even once.
   */
  useEffect(() => {
    if (isLoading || error) return;
    if (isAuthenticated) {
      redirecting.current = false;
      return;
    }
    if (redirecting.current) return;
    redirecting.current = true;
    const next = safeNextPath(location.href);
    void navigate({ to: "/login", search: next === "/" ? {} : { next }, replace: true });
  }, [isLoading, isAuthenticated, error, navigate, location.href]);

  if (isLoading) return <FullPageLoader />;

  // A RESTORED SESSION WINS OVER A FAILED REFETCH — what makes the installed
  // app usable in airplane mode: `/api/auth/me` cannot be reached, but the
  // persisted bootstrap payload is there, so the app renders and the
  // last-seen balance is visible. `OfflineBanner` says the rest.
  //
  // It is not a way in: the cookie is still the only thing the API accepts,
  // and a 401 once there IS a connection clears the cache and redirects.
  if (isAuthenticated) return <>{children}</>;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <ErrorState
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  return <FullPageLoader />;
}

/**
 * Wraps the ENTIRE authenticated app (docs/spec.md §4.2: `appRoute` is
 * `RequireAuth + RequireHousehold + AppShell`), not just the ledger screens —
 * unlike toon-recipe's per-route `RequireActiveGroup`. That is deliberately
 * simpler here: there is no "leave/delete household" path anywhere in the
 * UI (docs/spec.md never exposes one), so `household_required` is reachable
 * only through direct database surgery, not through anything a user can
 * trigger. The fallback below IS the household's birth certificate: a
 * self-contained create form, not a link to `/household` (which is inside
 * this same guard and would just show the identical fallback again).
 */
export function RequireHousehold({ children }: { children: ReactNode }) {
  const { household } = useSession();
  const queryClient = useQueryClient();
  const t = useT();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: (value: string) => createHousehold({ name: value }),
    onSuccess: () => {
      void invalidate.me(queryClient);
    },
  });

  if (!household) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <EmptyState
          icon={<Users />}
          title={t("settings.household.title")}
          description={t("settings.household.none")}
          action={
            <form
              className="flex w-full flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = name.trim();
                if (trimmed.length === 0) return;
                create.mutate(trimmed);
              }}
            >
              {create.isError ? <ErrorState inline error={create.error} /> : null}
              <Input
                label={t("settings.household.name")}
                required
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <Button type="submit" fullWidth loading={create.isPending}>
                {t("settings.household.create")}
              </Button>
            </form>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
