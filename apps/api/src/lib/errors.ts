/**
 * The single error path of the API.
 *
 * Throw `ApiError` (or one of the static helpers) anywhere in a handler; the
 * `onErrorHandler` mounted in src/index.ts turns it into the standard envelope
 *   { error: { code, message, details? } }
 * with the right HTTP status. Stack traces are logged, never sent.
 *
 * `text` is a KEY into the server catalog (`ServerKey`, or `{ key, values }`
 * for one that takes placeholders), never a literal sentence — `ServerKey` is
 * a union of the keys in `packages/shared/src/i18n/catalogs/server.de.ts`, so
 * a call site passing a German or English sentence directly is a COMPILE
 * ERROR, not a runtime one (docs/spec.md §3.1: "auf `code` branchen, nie auf
 * `message`" — this is the other half of that rule, enforced at the source).
 */
import type { ApiError as ApiErrorBody, ErrorCode } from "@toon/shared";
import { DEFAULT_LOCALE, type Locale, type MessageValues, type ServerKey, serverText, toValidationIssues } from "@toon/shared";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { env } from "../env.ts";
import { requestLocale } from "./locale.ts";

/** A server catalog key, optionally with the placeholder values it needs. */
export type ErrorText = ServerKey | { key: ServerKey; values: MessageValues };

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details?: unknown;
  readonly text: ErrorText;

  constructor(status: number, code: ErrorCode | string, text: ErrorText, details?: unknown) {
    // English: this is what lands in the log (ops output is one language —
    // CLAUDE.md's "Ops-Ausgabe ist immer Englisch" rule).
    super(serverText("en", text));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.text = text;
    this.details = details;
  }

  /** Renders `message` in `locale` (default: the deployment's `DEFAULT_LOCALE`). */
  toBody(locale: Locale = DEFAULT_LOCALE): ApiErrorBody {
    const message = serverText(locale, this.text);
    return this.details === undefined
      ? { error: { code: this.code, message } }
      : { error: { code: this.code, message, details: this.details } };
  }

  static badRequest(text: ErrorText = "server.error.badRequest", details?: unknown): ApiError {
    return new ApiError(400, "bad_request", text, details);
  }

  static unauthorized(text: ErrorText = "server.error.unauthorized"): ApiError {
    return new ApiError(401, "unauthorized", text);
  }

  static invalidCredentials(text: ErrorText = "server.error.invalidCredentials"): ApiError {
    return new ApiError(401, "invalid_credentials", text);
  }

  static forbidden(text: ErrorText = "server.error.forbidden"): ApiError {
    return new ApiError(403, "forbidden", text);
  }

  static notFound(text: ErrorText = "server.error.notFound"): ApiError {
    return new ApiError(404, "not_found", text);
  }

  static conflict(code: ErrorCode | string = "conflict", text: ErrorText = "server.error.conflict"): ApiError {
    return new ApiError(409, code, text);
  }

  static validationFailed(details: unknown, text: ErrorText = "server.error.badRequest"): ApiError {
    return new ApiError(422, "validation_failed", text, details);
  }

  static internal(text: ErrorText = "server.error.internal"): ApiError {
    return new ApiError(500, "internal_error", text);
  }
}

/** Builds the standard envelope from any thrown value. */
function toApiError(error: unknown, locale: Locale): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.validationFailed(toValidationIssues(error, locale));
  }

  if (error instanceof HTTPException) {
    const status = error.status;
    const code =
      status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not_found" : "bad_request";
    // The framework's own message is dropped, not forwarded: it is an
    // arbitrary string out of Hono's internals and may carry things we do not
    // want on the wire. It still reaches the log via console.error/warn below,
    // keyed on the ORIGINAL error, not this replacement.
    return new ApiError(status, code, "server.error.requestFailed");
  }

  return ApiError.internal();
}

/** Hono `app.onError` handler. */
export const onErrorHandler: ErrorHandler = (error, c: Context) => {
  const locale = requestLocale(c);
  const apiError = toApiError(error, locale);
  if (apiError.status >= 500) {
    console.error(`[api] ${c.req.method} ${c.req.path} ->`, error);
  } else if (env.NODE_ENV === "development") {
    console.warn(`[api] ${c.req.method} ${c.req.path} -> ${apiError.status} ${apiError.code}: ${apiError.message}`);
  }
  return c.json(apiError.toBody(locale), apiError.status as 400);
};

/** Hono `app.notFound` handler — same envelope as every other error. */
export const notFoundHandler: NotFoundHandler = (c: Context) => {
  const locale = requestLocale(c);
  const notFound = ApiError.notFound({
    key: "server.error.routeUnknown",
    values: { method: c.req.method, path: c.req.path },
  });
  return c.json(notFound.toBody(locale), 404);
};
