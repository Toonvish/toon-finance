/**
 * One shared `zValidator` hook for every router. `@hono/zod-validator`
 * answers 400 with a raw Zod result by default; the contract (docs/spec.md
 * §3.1) wants 422 `validation_failed` with a `details` array carrying a
 * per-issue `i18n: { key, values }` so the client can re-render the message
 * in ITS OWN active locale (a version-skewed client's negotiated locale can
 * differ from what the server just resolved).
 *
 * `toValidationIssues` already builds exactly that shape (packages/shared/src
 * /i18n/zod.ts) — this hook only supplies the request's negotiated locale.
 */
import { toValidationIssues } from "@toon/shared";
import type { Context } from "hono";
import type { ZodError } from "zod";
import { ApiError } from "./errors.ts";
import { requestLocale } from "./locale.ts";
import type { AppEnv } from "./types.ts";

/**
 * Loose on purpose: `@hono/zod-validator`'s `Hook` type is generic per schema
 * AND per Hono `Env`, and this function is passed to every
 * `zValidator(target, schema, ...)` call regardless of which router mounts
 * it. `c` stays an UNTYPED `Context` (Hono's bare generic default) rather
 * than `Context<AppEnv>` — typing it more narrowly than the base `Hook` type
 * makes TS infer a router's `Env` generic differently per call site, and the
 * contravariant parameter check then rejects this function outright. The
 * cast below is safe: every router in this codebase IS `new Hono<AppEnv>()`.
 */
export function onValidationError(result: { success: boolean; error?: unknown }, c: Context): void {
  if (result.success) return;
  const locale = requestLocale(c as Context<AppEnv>);
  throw ApiError.validationFailed(toValidationIssues(result.error as ZodError, locale));
}
