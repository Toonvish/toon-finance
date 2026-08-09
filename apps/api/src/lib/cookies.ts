/**
 * The one session cookie the API sets, so its flags (HttpOnly, SameSite,
 * Secure, Path, Max-Age) can never drift between the places that read and
 * write them. No OAuth/PKCE cookies here (decision #4 — email+password only).
 */
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../env.ts";

/** Name of the session cookie (docs/spec.md §3.1). */
export const SESSION_COOKIE = "toon_session";

/** 30 days — the lifetime of a fresh session. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sessions are renewed on use once less than 15 days remain (sliding expiry). */
export const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Base attributes of every cookie we set. `SameSite=Lax` is enough here (no
 * cross-site redirect flow to preserve, unlike an OAuth callback): the
 * invite-link landing page is a same-site top-level navigation either way.
 */
function baseOptions(): { path: string; httpOnly: true; sameSite: "Lax"; secure: boolean } {
  return { path: "/", httpOnly: true, sameSite: "Lax", secure: env.isProduction };
}

/** Sets/refreshes the session cookie so it expires with the DB row. */
export function setSessionCookie(c: Context, sessionId: string, expiresAt: number): void {
  const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  setCookie(c, SESSION_COOKIE, sessionId, { ...baseOptions(), maxAge });
}

/** Reads the raw session id from the request (undefined when absent). */
export function readSessionCookie(c: Context): string | undefined {
  const value = getCookie(c, SESSION_COOKIE);
  return value && value.length > 0 ? value : undefined;
}

/** Removes the session cookie (logout, invalid/expired session, password reset). */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { ...baseOptions(), maxAge: 0 });
}
