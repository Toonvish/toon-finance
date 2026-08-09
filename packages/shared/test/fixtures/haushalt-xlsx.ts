/**
 * Every number this test suite needs from `Haushalt.xlsx`, extracted once
 * (docs/ledger-spec.md §1-§6, §8) so it appears exactly once in the codebase.
 * `money.test.ts`, `ledger.test.ts` and `plan.test.ts` all import from here;
 * the `[IMPORT]`-owned `import-*.test.ts` files do too, so the 14 rent pairs
 * and the two ledger totals are never re-typed a second time.
 *
 * Every cell reference in a comment below is reproducible against the
 * workbook itself — see docs/ledger-spec.md for the extraction method.
 */

/** `A/B "Ausgaben"` — P1 paid, split 50/50. Rows 3-117, 111 amounts. */
export const COLUMN_B = {
  /** `K13 = SUM(B3:B1048576)` */
  sumCents: 3_148_217,
  /** Σ of `halfForOther(amount)` applied to each of the 111 rows individually — NOT half of `sumCents`. */
  sumHalvedCents: 1_574_092,
  /** Rows whose amount is odd, so the payer keeps one more cent than the non-payer. */
  oddCentRows: 39,
} as const;

/** `D/E "Schafi gezahlt"` — P2 paid, split 50/50. Rows 3-29, 27 amounts. */
export const COLUMN_E = {
  /** `K2 = SUM(E3:E300)` */
  sumCents: 234_113,
  sumHalvedCents: 117_052,
  oddCentRows: 9,
} as const;

/** `G/H "Schafi Extra"` — P1 paid, 100% attributable to P2. Rows 3-123, 121 amounts. */
export const COLUMN_H = {
  /** Including `H79`'s shared-string `"28,93"`, recovered by the importer's default mode. */
  sumCentsIncludingH79: 571_807,
  /** Excel's own `SUM(H3:H300)` — silently skips the text cell. `--excel-text-quirk` reproduces this. */
  sumCentsExcludingH79: 568_914,
} as const;

/** Individual sheet rows used as `halfForOther`/`deltaForTransaction` test vectors. */
export const SAMPLE_ROWS = {
  /** `B51`, a negative row ("Rückzahlung 24"). */
  b51: -76_273,
  /** `B9`, an odd positive row. */
  b9: 39_615,
  /** `E4`, an odd positive row. */
  e4: 18_995,
  /** `H47`, a negative `OTHER_ONLY` row ("Rückzahlung"). */
  h47: -46_844,
} as const;

/**
 * `M23:M36`/`N23:N36` — 14 `(amountCents, months)` pairs, expanded into one
 * `OTHER_ONLY` transaction per month (docs/ledger-spec.md §6.5). Starts at
 * `RENT_SERIES_START`, contiguous, 50 months total.
 */
export const RENT_SERIES: ReadonlyArray<readonly [amountCents: number, months: number]> = [
  [49_292, 1],
  [49_598, 4],
  [49_045, 4],
  [48_105, 3],
  [48_663, 4],
  [50_098, 3],
  [48_283, 5],
  [48_854, 5],
  [49_307, 2],
  [48_901, 1],
  [48_674, 3],
  [51_667, 2],
  [45_518, 2],
  [48_623, 11],
];

/** `O16`'s label `"Sandy Miete ab 01.06.2022"` is the only anchor for the series' start month. */
export const RENT_SERIES_START = "2022-06";
/** The last booked rent period before the live plan takes over at `2026-08`. */
export const RENT_SERIES_END = "2026-07";
/** `Σ months` across {@link RENT_SERIES} — the row count the importer writes for the rent series. */
export const RENT_SERIES_ROW_COUNT = 50;
/** `N21 = SUMPRODUCT(M23:M37, N23:N37)`. */
export const RENT_SERIES_SUM_CENTS = 2_441_570;

/** `K4` — the hand-maintained running total of every P2 -> P1 settlement ever made. */
export const TRANSFER_TOTAL_CENTS = 4_458_891;

/** `A6`, `A7`, `A10`, `A13` — label rows with no amount (docs/ledger-spec.md §1.5). Skipped, not zero-imported. */
export const SKIPPED_NO_AMOUNT_ROWS = 4;

/** `B/E/H` rows + the 50 expanded rent rows + the one `K4` settlement (docs/ledger-spec.md §6.1). */
export const TOTAL_IMPORTED_TRANSACTIONS = 111 + 27 + 121 + RENT_SERIES_ROW_COUNT + 1;

/**
 * The six fixed-cost items inlined in `R8` (docs/ledger-spec.md §4.1). Two
 * labels ("Nebenkosten", the two "Streaming" rows) are the importer's guess —
 * the sheet only names the total.
 */
export const FIXED_COST_ITEMS = [
  { label: "Miete", amountCents: 106_000 },
  { label: "Nebenkosten", amountCents: 12_400 },
  { label: "Strom", amountCents: 4_671 },
  { label: "Internet", amountCents: 1_836 },
  { label: "Streaming 1", amountCents: 1_499 },
  { label: "Streaming 2", amountCents: 1_499 },
] as const;

/** `R8` — the sum of {@link FIXED_COST_ITEMS}. */
export const FIXED_COST_TOTAL_CENTS = 127_905;

/** `R5`/`R6` — the two gross monthly incomes as of `2025-09`. */
export const INCOMES = {
  p1Cents: 333_826,
  p2Cents: 204_734,
} as const;

/** `R7` = `R5 + R6`. */
export const INCOME_TOTAL_CENTS = 538_560;

/** `R11` — P2's income-proportional share, rounded. Matches the last {@link RENT_SERIES} row (`486.23 x 11`). */
export const SHARE_P2_CENTS = 48_623;

/** `R10` — P1's share, the complement: `FIXED_COST_TOTAL_CENTS - SHARE_P2_CENTS`. */
export const SHARE_P1_CENTS = 79_282;

/**
 * The four reference figures from `§6.7`'s reconciliation. `sheetK21Cents` is
 * NOT an integer — the sheet's own `K3 = K2/2` is never rounded — so it is
 * kept as a plain `number` for comparison only, never as money.
 */
export const REFERENCE_BALANCES = {
  /** The importer's default mode: `H79`'s `"28,93"` recovered. */
  importerDefaultCents: 11_526,
  /** `--excel-text-quirk`: `H79` excluded, reproducing the sheet's own arithmetic. */
  excelTextQuirkCents: 8_633,
  /** `K21 = (K14 + K15 - K5)`, for reference only — never ground truth. */
  sheetK21Cents: 8_645.5,
} as const;
