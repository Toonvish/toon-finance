/**
 * Same-origin guard for every state-changing `/api/*` request — the API's
 * CSRF defence, in depth behind the `SameSite=Lax` session cookie.
 *
 * `Lax` alone stops a cross-SITE form post from carrying the cookie, but it
 * says nothing about a sibling on the same site: the shared `toon-edge` proxy
 * hosts SEVERAL toon apps under one registrable domain, so a script running on
 * the recipe app's origin is "same-site" for the browser and the finance
 * cookie rides along. And the auth router parses JSON out of ANY content type
 * (`readJson`), so a `text/plain` form body is enough to reach it. Two checks,
 * both cheap, both browser-set and therefore unforgeable from a page:
 *
 *   1. `Sec-Fetch-Site: cross-site | same-site`  -> 403 (`same-origin` and
 *      `none`, a user-typed navigation, pass).
 *   2. `Origin` present and its host differs from the request's own host
 *      -> 403. Only the HOST is compared, never the scheme: the edge proxy
 *      terminates TLS, so the browser says `https://…` while the API sees the
 *      plain-http URL Caddy forwarded. Requests WITHOUT an `Origin` header
 *      (curl, the README walkthrough, the test harness, server-to-server) are
 *      not browser requests and pass — a browser always sends `Origin` on a
 *      cross-origin unsafe request, which is the only case this file is for.
 *
 * GET/HEAD/OPTIONS are never checked: they must be side-effect-free anyway,
 * and blocking them would only break bookmarks and the service worker.
 */
import type { MiddlewareHandler } from "hono";
import { ApiError } from "../lib/errors.ts";
import type { AppEnv } from "../lib/types.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** True when a browser-originated unsafe request comes from another origin. */
export function isForeignOrigin(request: {
  method: string;
  url: string;
  header: (name: string) => string | undefined;
}): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;

  const fetchSite = request.header("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site" || fetchSite === "same-site") return true;

  const origin = request.header("origin");
  if (!origin || origin === "null") return origin === "null";

  const originHost = hostOf(origin);
  const requestHost = hostOf(request.url);
  if (originHost === null || requestHost === null) return true;
  return originHost !== requestHost;
}

/** Hono middleware: 403 `forbidden` for a foreign-origin unsafe request. */
export function originGuard(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (isForeignOrigin({ method: c.req.method, url: c.req.url, header: (name) => c.req.header(name) }))
      throw ApiError.forbidden("server.error.originMismatch");
    await next();
  };
}
