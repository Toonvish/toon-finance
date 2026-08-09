/**
 * Catalog integrity + the store's pure-function surface.
 *
 * `bun test` has no DOM/localStorage/network, so this file touches ONLY
 * `setLocaleForTest` (no side effects) and `translate()` (pure, ambient
 * locale). `setLocalePreference()`/`initLocale()` are exercised by hand in a
 * real browser.
 *
 * `setLocaleForTest` obeys the `setMailer` handback rule: `afterAll` resets it
 * to DEFAULT_LOCALE, or every later file in this one-process test run
 * inherits whatever locale the last describe block left behind.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { DEFAULT_LOCALE, LOCALES } from "@toon/shared";
import { CATALOGS, type MessageKey } from "./catalogs/index.ts";
import { readLocalePreference, resolveDeviceLocale, resolveSystemLocale } from "./locale.ts";
import { getLocale, setLocaleForTest, translate } from "./store.ts";

const NAMESPACE_PREFIXES = [
  "common.",
  "auth.",
  "nav.",
  "transactions.",
  "categories.",
  "plan.",
  "balance.",
  "settings.",
];

describe("catalog integrity", () => {
  test("every namespace's keys are prefixed and prefixes never collide", () => {
    for (const key of Object.keys(CATALOGS.de)) {
      const matches = NAMESPACE_PREFIXES.filter((prefix) => key.startsWith(prefix));
      expect(matches.length).toBe(1);
    }
  });

  test("de and en list exactly the same keys", () => {
    expect(Object.keys(CATALOGS.en).sort()).toEqual(Object.keys(CATALOGS.de).sort());
  });

  test("every plural entry carries an `other` form, in both locales", () => {
    for (const locale of ["de", "en"] as const) {
      for (const entry of Object.values(CATALOGS[locale]) as Array<string | { other?: string }>) {
        if (typeof entry !== "string") {
          expect(entry.other).toBeDefined();
        }
      }
    }
  });

  test("the placeholder set of every key is identical in de and en", () => {
    const placeholdersOf = (entry: unknown): string[] => {
      const text = typeof entry === "string" ? entry : (entry as { other: string }).other;
      return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    };
    for (const key of Object.keys(CATALOGS.de) as MessageKey[]) {
      expect(placeholdersOf(CATALOGS.en[key])).toEqual(placeholdersOf(CATALOGS.de[key]));
    }
  });
});

describe("translate() — ambient locale, outside React", () => {
  afterAll(() => setLocaleForTest(DEFAULT_LOCALE));

  test("renders in the current ambient locale", () => {
    setLocaleForTest("de");
    expect(translate("common.save")).toBe("Speichern");
    setLocaleForTest("en");
    expect(translate("common.save")).toBe("Save");
  });

  test("interpolates values", () => {
    setLocaleForTest("de");
    expect(translate("balance.owesYou", { name: "Robin", amount: "86,46 €" })).toBe(
      "Robin schuldet dir 86,46 €",
    );
  });

  test("selects the right plural form", () => {
    setLocaleForTest("de");
    expect(translate("transactions.count", { count: 1 })).toBe("1 Buchung");
    expect(translate("transactions.count", { count: 5 })).toBe("5 Buchungen");
  });

  test("a missing key resolves to the key itself, never throws", () => {
    setLocaleForTest("de");
    // @ts-expect-error deliberately not a real key
    expect(translate("does.not.exist")).toBe("does.not.exist");
  });

  test("getLocale reflects setLocaleForTest", () => {
    setLocaleForTest("en");
    expect(getLocale()).toBe("en");
    setLocaleForTest("de");
    expect(getLocale()).toBe("de");
  });
});

/**
 * The read-only half of the locale-preference layer.
 *
 * `setLocalePreference()` is deliberately NOT exercised here: it writes
 * `localStorage`, touches `document.documentElement` and fires a PATCH, none
 * of which exist under `bun test`. What IS testable is that the resolvers
 * degrade safely when the browser is absent — which is also exactly what
 * they must do in private-mode Safari, where `localStorage` access throws.
 */
describe("locale preference", () => {
  test("no browser at all resolves to the default, never to undefined", () => {
    expect(resolveSystemLocale()).toBe(DEFAULT_LOCALE);
    expect(resolveDeviceLocale()).toBe(DEFAULT_LOCALE);
  });

  test('an unset preference reads as "system", not as the default locale', () => {
    expect(readLocalePreference()).toBe("system");
    expect(LOCALES as readonly string[]).not.toContain("system");
  });

  test("every locale has a picker label, in every catalog", () => {
    // The label for a locale must exist in the OTHER locale's catalog too, or
    // a user who switched to a language they cannot read has no way back.
    for (const locale of LOCALES) {
      for (const catalogLocale of LOCALES) {
        const key = `settings.language.${locale}`;
        expect(Object.hasOwn(CATALOGS[catalogLocale], key), `${key} missing from ${catalogLocale}`).toBe(
          true,
        );
      }
    }
  });

  test("language names are autonyms — identical across catalogs", () => {
    for (const locale of LOCALES) {
      const key = `settings.language.${locale}` as MessageKey;
      expect(CATALOGS.en[key]).toBe(CATALOGS.de[key]);
    }
  });
});
