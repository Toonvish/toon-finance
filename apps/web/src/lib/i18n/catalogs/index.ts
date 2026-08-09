/**
 * The web app's catalog registry: every UI namespace, merged, for both
 * locales. A port/feature agent extends its own namespace files, never this
 * one. Namespace prefixes are disjoint by construction
 * (`NamespaceCatalog<Prefix>`), so this merge is order-independent — a
 * runtime test in `i18n.test.ts` asserts that anyway.
 */
import { authDe } from "./auth.de.ts";
import { authEn } from "./auth.en.ts";
import { balanceDe } from "./balance.de.ts";
import { balanceEn } from "./balance.en.ts";
import { categoriesDe } from "./categories.de.ts";
import { categoriesEn } from "./categories.en.ts";
import { commonDe } from "./common.de.ts";
import { commonEn } from "./common.en.ts";
import { navDe } from "./nav.de.ts";
import { navEn } from "./nav.en.ts";
import { planDe } from "./plan.de.ts";
import { planEn } from "./plan.en.ts";
import { settingsDe } from "./settings.de.ts";
import { settingsEn } from "./settings.en.ts";
import { transactionsDe } from "./transactions.de.ts";
import { transactionsEn } from "./transactions.en.ts";

const de = {
  ...commonDe,
  ...authDe,
  ...navDe,
  ...transactionsDe,
  ...categoriesDe,
  ...planDe,
  ...balanceDe,
  ...settingsDe,
};
const en = {
  ...commonEn,
  ...authEn,
  ...navEn,
  ...transactionsEn,
  ...categoriesEn,
  ...planEn,
  ...balanceEn,
  ...settingsEn,
};

export const CATALOGS = { de, en } as const;
export type MessageKey = keyof typeof de;
