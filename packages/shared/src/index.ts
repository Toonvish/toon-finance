/**
 * @toon/shared — the single source of truth for the toon-finance API contract
 * and the pure ledger/plan/import logic.
 *
 * Contains ONLY pure code: Zod schemas, inferred types, cent arithmetic and
 * the i18n runtime. Never import node/bun APIs here — the web bundle imports
 * this module too.
 *
 * `packages/shared/src/import/*.ts` (the xlsx importer's pure parsers) is a
 * separate ownership area ([IMPORT], docs/spec.md §5.2) and is re-exported
 * here by that agent, not by this barrel.
 */

// --- pure domain logic -------------------------------------------------------
export * from "./money.ts";
export * from "./ledger.ts";
export * from "./period.ts";
export * from "./plan.ts";
export * from "./categories.ts";
export * from "./tags.ts";

// --- contract: schemas + inferred types -------------------------------------
export * from "./schemas/common.ts";
export * from "./schemas/health.ts";
export * from "./schemas/auth.ts";
export * from "./schemas/households.ts";
export * from "./schemas/transactions.ts";
export * from "./schemas/categories.ts";
export * from "./schemas/tags.ts";
export * from "./schemas/plan.ts";
export * from "./schemas/balance.ts";
export * from "./schemas/settlements.ts";

// --- interface language: the i18n runtime + server catalogs -----------------
export * from "./i18n/locale.ts";
export * from "./i18n/types.ts";
export * from "./i18n/translate.ts";
export * from "./i18n/zod.ts";
export * from "./i18n/catalogs/index.ts";
