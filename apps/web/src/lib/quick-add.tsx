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

export interface QuickAddApi {
  isOpen: boolean;
  /**
   * `false` while a screen already IS the capture form — `/new`. The two
   * frames share `useCreateTransactionForm` but each frame owns its own
   * INSTANCE of that state, so a "+" tapped on `/new` would lay a second,
   * independent draft over the one being typed into: two amounts, two
   * "Buchen" buttons, and no way to tell which is about to be sent.
   */
  isAvailable: boolean;
  open: () => void;
  close: () => void;
  /** See {@link useQuickAddHostedHere}; returns the release function. */
  claimHost: () => () => void;
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
  // A COUNTER, not a boolean: React mounts the incoming screen before it
  // unmounts the outgoing one, so two hosts overlap for a render during a
  // navigation and a boolean would be cleared by the one that is leaving.
  const [hostCount, setHostCount] = useState(0);
  const isAvailable = hostCount === 0;

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const claimHost = useCallback(() => {
    setHostCount((count) => count + 1);
    // Navigating to `/new` while the sheet is up would leave both on screen.
    setIsOpen(false);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHostCount((count) => Math.max(0, count - 1));
    };
  }, []);

  // The `n` listener is bound ONCE and reads the claim through a ref:
  // re-binding it whenever `/new` mounts or unmounts would drop the
  // keystrokes that land in between.
  const availableRef = useRef(isAvailable);
  availableRef.current = isAvailable;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "n" && event.key !== "N") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (!availableRef.current) return;
      event.preventDefault();
      setIsOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<QuickAddApi>(
    () => ({ isOpen, isAvailable, open, close, claimHost }),
    [isOpen, isAvailable, open, close, claimHost],
  );
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

/**
 * Claims "this screen already hosts the capture form" for the component's
 * lifetime, so the floating "+", the sidebar's primary button and `n` all
 * stand down instead of opening a second draft on top of this one (`/new`).
 */
export function useQuickAddHostedHere(): void {
  const { claimHost } = useQuickAdd();
  useEffect(() => claimHost(), [claimHost]);
}
