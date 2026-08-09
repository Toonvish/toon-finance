/**
 * Viewport media queries as React state.
 *
 * Tailwind handles almost everything responsive here, and it should: a CSS
 * breakpoint costs nothing and cannot be wrong. This exists for the rare case
 * where two layouts need DIFFERENT MARKUP rather than different styling
 * (e.g. a screen that renders a compact list on a phone and a denser table
 * from `lg` up) — rendering both and hiding one with `lg:hidden` is a trap
 * whenever the hidden half still does work (fetches, mounts a chart, etc.).
 */
import { useCallback, useSyncExternalStore } from "react";

/** Tailwind's `lg` — the sidebar breakpoint (components/layout/SideNav.tsx). */
export const LG_QUERY = "(min-width: 64rem)";

/** Subscribes to a media query and re-renders when it flips. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True from Tailwind's `lg` up — mirrors the CSS breakpoint that shows the sidebar. */
export function useIsDesktopViewport(): boolean {
  return useMediaQuery(LG_QUERY);
}
