/**
 * The React binding onto the ambient locale store: `useLocale()` re-renders on
 * a switch, `useT()` returns a fully-typed translator bound to the current
 * locale. Components MUST use these, never `translate()` from `store.ts`
 * directly — a `translate()` call inside a component body renders stale copy
 * after a switch, and it typechecks anyway, which is what makes it dangerous.
 */
import { createTranslator, type Locale, type Translator } from "@toon/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { CATALOGS, type MessageKey } from "./catalogs/index.ts";
import { readLocalePreference, type LocalePreference } from "./locale.ts";
import { getLocale, refreshSystemLocale, setLocalePreference, subscribeLocale } from "./store.ts";

type AppCatalog = typeof CATALOGS.de;

const LocaleContext = createContext<Locale | null>(null);

/**
 * No provider-level state of its own — `useSyncExternalStore` subscribes
 * straight to the module-level store (`store.ts`), so a locale change re-renders
 * every consumer without threading state through the tree. `LocaleContext` only
 * exists so `useLocale()`/`useT()` can be called without a Provider in a unit
 * test (falls back to reading the store directly, see below).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/**
 * The active locale, re-rendering on every `setLocalePreference()` call. Falls back to a
 * direct store subscription so this also works without an `<I18nProvider>`
 * ancestor (e.g. a component rendered in isolation in a test).
 */
export function useLocale(): Locale {
  const fromContext = useContext(LocaleContext);
  const fromStore = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return fromContext ?? fromStore;
}

/** A translator bound to the current locale, typed against the full UI catalog. */
export function useT(): Translator<AppCatalog> {
  const locale = useLocale();
  return createTranslator(CATALOGS[locale], locale);
}

/**
 * The language picker's state: the three-state PREFERENCE, the `Locale` it
 * currently resolves to, and the setter. Shaped like `useTheme()` on purpose —
 * the two settings cards are the same control over a different axis.
 *
 * The `languagechange` listener is what makes `"system"` mean "keep following
 * the browser" rather than "followed it once at boot". It is registered
 * unconditionally but only acts while the preference is `"system"`: re-resolving
 * under an explicit choice would silently overrule the user. Firefox and Safari
 * do not always emit the event, so this is a best-effort improvement over the
 * boot-time read, never the thing correctness rests on.
 */
export function useLocalePreference(): {
  preference: LocalePreference;
  locale: Locale;
  setPreference: (preference: LocalePreference) => void;
} {
  const locale = useLocale();
  const [preference, setPreferenceState] = useState<LocalePreference>(() => readLocalePreference());

  useEffect(() => {
    if (preference !== "system") return;
    const listener = () => refreshSystemLocale();
    window.addEventListener("languagechange", listener);
    return () => window.removeEventListener("languagechange", listener);
  }, [preference]);

  const setPreference = useCallback((next: LocalePreference) => {
    setPreferenceState(next);
    setLocalePreference(next);
  }, []);

  return { preference, locale, setPreference };
}

export type { MessageKey };
