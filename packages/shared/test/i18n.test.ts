import { describe, expect, test } from "bun:test";
import { isLocale, negotiateLocale, DEFAULT_LOCALE, LOCALES } from "../src/i18n/locale.ts";
import { createTranslator, hasKey, interpolate, pluralRulesFor, resolveCatalogKey } from "../src/i18n/translate.ts";
import { resolveWireKey, serverText, SERVER_CATALOGS } from "../src/i18n/catalogs/index.ts";
import { resolveZodIssue } from "../src/i18n/zod.ts";
import type { $ZodIssue } from "zod/v4/core";

describe("locale negotiation", () => {
  test("isLocale accepts only known locales", () => {
    expect(isLocale("de")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  test("negotiateLocale picks the first supported primary subtag", () => {
    expect(negotiateLocale("en-US,de;q=0.8")).toBe("en");
    expect(negotiateLocale("fr-FR,de-DE;q=0.5")).toBe("de");
  });

  test("negotiateLocale falls back when nothing matches or the header is absent", () => {
    expect(negotiateLocale("fr-FR,it-IT")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(undefined, "en")).toBe("en");
  });

  test("DEFAULT_LOCALE is de and is a member of LOCALES", () => {
    expect(DEFAULT_LOCALE).toBe("de");
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});

describe("interpolate", () => {
  test("replaces every {name} with the matching value", () => {
    expect(interpolate("{name} schuldet dir {amount}", { name: "Robin", amount: "12,50 €" })).toBe(
      "Robin schuldet dir 12,50 €",
    );
  });

  test("leaves an unmatched placeholder untouched", () => {
    expect(interpolate("Hallo {name}", {})).toBe("Hallo {name}");
  });

  test("returns the template unchanged with no values", () => {
    expect(interpolate("Ausgeglichen")).toBe("Ausgeglichen");
  });
});

describe("createTranslator + plurals", () => {
  const catalog = {
    "test.hello": "Hallo {name}",
    "test.count": { one: "{count} Buchung", other: "{count} Buchungen" },
  } as const;

  test("renders a plain string entry", () => {
    const t = createTranslator(catalog, "de");
    expect(t("test.hello", { name: "Welt" })).toBe("Hallo Welt");
  });

  test("selects the plural form via Intl.PluralRules", () => {
    const t = createTranslator(catalog, "de");
    expect(t("test.count", { count: 1 })).toBe("1 Buchung");
    expect(t("test.count", { count: 5 })).toBe("5 Buchungen");
  });

  test("a missing key degrades to the key itself, never throws", () => {
    const t = createTranslator(catalog, "de");
    // @ts-expect-error -- intentionally an unknown key, to exercise the missing-key path
    expect(t("test.nope")).toBe("test.nope");
  });

  test("pluralRulesFor is cached per locale and selects a real category", () => {
    const rules = pluralRulesFor("de");
    expect(rules.select(1)).toBe("one");
    expect(rules.select(5)).toBe("other");
  });

  test("hasKey / resolveCatalogKey", () => {
    expect(hasKey(catalog, "test.hello")).toBe(true);
    expect(hasKey(catalog, "test.unknown")).toBe(false);
    expect(resolveCatalogKey(catalog, "de", "test.hello", { name: "X" })).toBe("Hallo X");
    expect(resolveCatalogKey(catalog, "de", "test.unknown")).toBeUndefined();
  });
});

describe("resolveWireKey / serverText — the server catalogs", () => {
  test("resolves a known server key in both locales", () => {
    expect(resolveWireKey("de", "server.error.notFound")).toBe("Nicht gefunden");
    expect(resolveWireKey("en", "server.error.notFound")).toBe("Not found");
  });

  test("returns undefined (never the raw key) for an unknown wire key", () => {
    expect(resolveWireKey("de", "server.does.not.exist")).toBeUndefined();
  });

  test("serverText renders a bare ServerKey or a {key, values} pair", () => {
    expect(serverText("de", "server.error.notFound")).toBe("Nicht gefunden");
    expect(serverText("de", { key: "server.error.tooManyAttempts", values: { seconds: 30 } })).toBe(
      "Zu viele Versuche. Bitte in 30 Sekunden erneut probieren.",
    );
  });

  test("every de key has a matching en key and vice versa", () => {
    const deKeys = Object.keys(SERVER_CATALOGS.de).sort();
    const enKeys = Object.keys(SERVER_CATALOGS.en).sort();
    expect(enKeys).toEqual(deKeys);
  });
});

describe("resolveZodIssue — the field/code/facet resolution ladder", () => {
  function issue(partial: Partial<$ZodIssue> & Pick<$ZodIssue, "code">): $ZodIssue {
    return { path: [], message: "unused", input: undefined, ...partial } as $ZodIssue;
  }

  test("falls back to server.zod.fallback for a completely generic issue", () => {
    const resolved = resolveZodIssue(issue({ code: "custom" } as $ZodIssue), "de");
    expect(resolved.key).toBe("server.zod.fallback");
  });

  test("a field-specific candidate wins over the generic one", () => {
    const resolved = resolveZodIssue(
      issue({ code: "invalid_format", path: ["email"], format: "email", input: "not-an-email" } as never),
      "de",
    );
    expect(resolved.key).toBe("server.zod.field.email.invalid_format");
  });

  test("without a field-specific key, falls back to code.facet", () => {
    const resolved = resolveZodIssue(
      issue({ code: "invalid_format", path: ["url"], format: "uuid", input: "nope" } as never),
      "de",
    );
    expect(resolved.key).toBe("server.zod.invalid_format.uuid");
  });

  test("an explicit refineKey on a custom issue always wins", () => {
    const resolved = resolveZodIssue(
      issue({ code: "custom", params: { i18n: "server.validation.periodFormat" } } as never),
      "de",
    );
    expect(resolved.key).toBe("server.validation.periodFormat");
    expect(resolved.message).toBe("Bitte gib einen Monat im Format JJJJ-MM an.");
  });

  test("too_small carries its bound into the values and the message", () => {
    const resolved = resolveZodIssue(
      issue({ code: "too_small", path: ["password"], origin: "string", minimum: 10, input: "" } as never),
      "de",
    );
    expect(resolved.key).toBe("server.zod.field.password.too_small");
    expect(resolved.message).toBe("Das Passwort braucht mindestens 10 Zeichen.");
  });
});
