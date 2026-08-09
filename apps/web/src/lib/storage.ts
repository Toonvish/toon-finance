/**
 * Tiny typed localStorage wrapper. Private-mode Safari throws on access, so every
 * call is guarded and silently degrades to "no persistence".
 *
 * The prefix (`toon-finance.`) is not cosmetic: `index.html`'s inline
 * pre-paint theme script ([GERÜST]) hard-codes the literal key
 * `"toon-finance.theme"` so it can apply the saved colour scheme before this
 * module (or React) has loaded. If this prefix ever changes, that inline
 * script must change in the same commit.
 */

const PREFIX = "toon-finance.";

export const storageKeys = {
  /** Explicit theme choice ("light" | "dark"); absent = "system" (lib/theme.ts). */
  theme: `${PREFIX}theme`,
  /** Explicit locale choice ("de" | "en"); absent = "system" (lib/i18n/locale.ts). */
  locale: `${PREFIX}locale`,
  installPromptDismissedAt: `${PREFIX}installPromptDismissedAt`,
  /**
   * Which account the persisted offline cache belongs to (see lib/persist.ts).
   *
   * A POINTER, never data: it has to be readable synchronously at boot so an
   * offline start knows which IndexedDB blob to restore before any network
   * call. Cleared on logout, together with the blob itself.
   */
  lastUserId: `${PREFIX}lastUserId`,
} as const;

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — not fatal */
  }
}
