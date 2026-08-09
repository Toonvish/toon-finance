/**
 * Negotiates the INTERFACE locale for one request from `Accept-Language`
 * (CORS-safelisted, so it costs no preflight — docs/spec.md §3.1). This is
 * never `households.defaultLocale` (the CONTENT axis a server-written row is
 * rendered in, see plan.bookingDescription in the [API-DOMÄNE] plan service) —
 * that is a per-row write-time choice, this is a per-request read-time one.
 */
import { negotiateLocale, type Locale } from "@toon/shared";
import type { Context, MiddlewareHandler } from "hono";
import { env } from "../env.ts";
import type { AppEnv } from "./types.ts";

export const localeMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("locale", negotiateLocale(c.req.header("accept-language"), env.defaultLocale));
  await next();
};

/**
 * Falls back to the configured default if the middleware did not run —
 * `onError`/`notFound` can fire before an `app.use("*")` middleware has, so
 * this `??` is load-bearing. Do not "fix" `AppVariables.locale` to be
 * non-optional; that would make this dead code and invite someone to delete it.
 */
export function requestLocale(c: Context<AppEnv>): Locale {
  return c.get("locale") ?? env.defaultLocale;
}
