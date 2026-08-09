/**
 * The SERVER-side catalog registry (errors, validation, mail). Both the API
 * and the browser run the Zod schemas that produce these keys, so this lives
 * in `packages/shared` rather than only in `apps/api`.
 */
import { DEFAULT_LOCALE, type Locale } from "../locale.ts";
import { resolveCatalogKey } from "../translate.ts";
import type { MessageValues } from "../types.ts";
import { serverDe, type ServerKey } from "./server.de.ts";
import { serverEn } from "./server.en.ts";

export const SERVER_CATALOGS = { de: serverDe, en: serverEn } as const;
export type { ServerKey };

/**
 * Resolves a key that came off the wire against the SERVER catalogs — the
 * shape every `details[].i18n.key` and every `ApiError` key uses. `undefined`
 * when this bundle's catalog does not know the key (a version skew): the
 * caller MUST fall back to the wire's own `message`, never to the raw key.
 * This is the ONLY sanctioned way to translate an untyped `string`.
 */
export function resolveWireKey(locale: Locale, key: string, values?: MessageValues): string | undefined {
  return resolveCatalogKey(SERVER_CATALOGS[locale] ?? SERVER_CATALOGS[DEFAULT_LOCALE], locale, key, values);
}

/** Renders a `ServerKey` (or `{ key, values }`) in `locale` — used by `ApiError.toBody()`. */
export function serverText(
  locale: Locale,
  text: ServerKey | { key: ServerKey; values: MessageValues },
): string {
  const key = typeof text === "string" ? text : text.key;
  const values = typeof text === "string" ? undefined : text.values;
  return resolveWireKey(locale, key, values) ?? key;
}
