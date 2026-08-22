/**
 * The one piece of state the global "Erfassen" affordance needs: is the
 * quick-add sheet open?
 *
 * It lives in `lib/` ([WEB-KERN]) rather than in `features/transactions/`
 * because BOTH sides of the app touch it and neither may import the other:
 * `components/layout/*` opens it (the floating "+" on phones, the sidebar's
 * primary button on desktop), and `features/transactions/QuickAddDialog`
 * renders it. The dialog itself stays in the feature — only the switch is
 * shared.
 *
 * The `n` shortcut is bound here too, next to the state it flips, so the
 * sidebar's "N" hint can never drift away from what the keyboard actually
 * does.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface QuickAddApi {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const QuickAddContext = createContext<QuickAddApi | null>(null);

/**
 * `true` while the keystroke belongs to something the user is typing into —
 * a bare `n` must reach the field, not the sheet. `isContentEditable` covers
 * rich-text hosts; `closest("[role=textbox]")` covers the rest.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.closest("[role='textbox']") !== null;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "n" && event.key !== "N") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setIsOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<QuickAddApi>(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>;
}

/**
 * Throws outside the provider on purpose: a "+" that silently does nothing
 * is the worst failure mode this control has.
 */
export function useQuickAdd(): QuickAddApi {
  const value = useContext(QuickAddContext);
  if (!value) throw new Error("useQuickAdd must be used inside <QuickAddProvider>");
  return value;
}
