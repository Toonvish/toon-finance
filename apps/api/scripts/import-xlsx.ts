#!/usr/bin/env bun
/**
 * [IMPORT] `bun run import:xlsx <path-to-Haushalt.xlsx> [--household <id>]
 * [--dry-run] [--excel-text-quirk]`
 *
 * The one-off, never-repeated CLI import of `Haushalt.xlsx`'s `Kostenrechnung`
 * sheet into the real ledger (docs/ledger-spec.md §6). Not a UI feature, not
 * an endpoint (docs/spec.md task brief). All ops output is English literals —
 * this file never touches the i18n catalog for its own console output
 * (CLAUDE.md's ops-output rule); the transaction *content* it writes is a
 * different matter and is discussed at each call site below.
 *
 * `--household <id>` is required to actually write anything: the two payer
 * ids (slot 1 / slot 2) have to come from a real household with two seated
 * members (e.g. one created by `bun run seed`). Without it — or with
 * `--dry-run` — the script only reads the workbook, prints the reconciliation
 * report, and exits without opening the database at all.
 *
 * `--excel-text-quirk` reproduces Excel's own arithmetic (its `SUM` silently
 * skips the one text-typed amount cell in the workbook, `H79`); it changes
 * both the printed comparison AND, if a write happens, the imported data
 * itself, so an operator can convince themselves the rest of the pipeline is
 * faithful (docs/ledger-spec.md §6.7). The DEFAULT import always recovers
 * that amount — the whole reason this importer exists is to fix that quiet
 * 28.93 EUR bug, not to reproduce it.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { computeBalance, formatCents, periodStartMs, type BalanceTransaction } from "@toon/shared";
import { eq } from "drizzle-orm";
import { categorize, DEFAULT_CATEGORY_FALLBACK } from "./import/categorize.ts";
import { AmountParseError, parseAmountCell } from "./import/amounts.ts";
import { type CalendarDate, dateStartMsBerlin, resolveColumnDates } from "./import/dates.ts";
import { expandRentSeries, RENT_SERIES_START, type RentSeriesPair } from "./import/rent.ts";
import { cellText, readWorkbook, type XlsxWorkbook } from "./import/xlsx-reader.ts";

/* -------------------------------------------------------------------------- */
/* CLI args                                                                   */
/* -------------------------------------------------------------------------- */

interface CliArgs {
  filePath: string;
  householdId: string | undefined;
  dryRun: boolean;
  excelTextQuirk: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let filePath: string | undefined;
  let householdId: string | undefined;
  let dryRun = false;
  let excelTextQuirk = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--excel-text-quirk") excelTextQuirk = true;
    else if (arg === "--household") householdId = argv[++i];
    else if (arg.startsWith("--household=")) householdId = arg.slice("--household=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run import:xlsx <path-to-Haushalt.xlsx> [--household <id>] [--dry-run] [--excel-text-quirk]",
      );
      process.exit(0);
    } else if (!arg.startsWith("-") && filePath === undefined) filePath = arg;
    else {
      console.error(`[import-xlsx] unrecognised argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!filePath) {
    console.error("[import-xlsx] missing required argument: <path-to-Haushalt.xlsx>");
    process.exit(1);
  }
  return { filePath: resolve(process.cwd(), filePath), householdId, dryRun: dryRun || !householdId, excelTextQuirk };
}

/* -------------------------------------------------------------------------- */
/* Sheet layout constants (structural facts about THIS workbook, not data —   */
/* docs/ledger-spec.md §1.1/§1.2/§6.1)                                        */
/* -------------------------------------------------------------------------- */

/** Data starts at row 3 in every one of the three column pairs (rows 1-2 are the sheet's own headers). */
const DATA_START_ROW = 3;
const MOVE_IN: CalendarDate = { year: 2021, month: 9, day: 1 };

interface ColumnSpec {
  label: string; // "A/B" — for the report
  labelCol: string;
  amountCol: string;
  payer: "P1" | "P2";
  splitMode: "SPLIT_EQUAL" | "OTHER_ONLY";
  externalKeyPrefix: string;
}

const COLUMNS: readonly ColumnSpec[] = [
  { label: "A/B  Ausgaben", labelCol: "A", amountCol: "B", payer: "P1", splitMode: "SPLIT_EQUAL", externalKeyPrefix: "xlsx:B" },
  { label: "D/E  Schafi gezahlt", labelCol: "D", amountCol: "E", payer: "P2", splitMode: "SPLIT_EQUAL", externalKeyPrefix: "xlsx:E" },
  { label: "G/H  Schafi Extra", labelCol: "G", amountCol: "H", payer: "P1", splitMode: "OTHER_ONLY", externalKeyPrefix: "xlsx:H" },
];

/* -------------------------------------------------------------------------- */
/* Calendar helpers                                                           */
/* -------------------------------------------------------------------------- */

function todayBerlin(): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

interface ExtractedRow {
  row: number;
  label: string;
  amountCents: number | null;
}

interface UnparsableCell {
  ref: string;
  raw: string;
}

/**
 * `unparsable_amount` cells are collected, not thrown past — the report
 * names every one of them and the run still fails at the end (non-zero
 * exit), per docs/ledger-spec.md §6.2: a bad cell must never be silently
 * skipped as if it were merely empty.
 */
function extractColumn(
  workbook: XlsxWorkbook,
  labelCol: string,
  amountCol: string,
  excelTextQuirk: boolean,
  unparsable: UnparsableCell[],
): ExtractedRow[] {
  const rows: ExtractedRow[] = [];
  for (let row = DATA_START_ROW; row <= workbook.maxRow; row++) {
    const labelCell = workbook.cells.get(`${labelCol}${row}`);
    const label = cellText(labelCell, workbook.sharedStrings);
    if (label === undefined || label.trim() === "") continue;
    const amountCell = workbook.cells.get(`${amountCol}${row}`);
    try {
      const amountCents = parseAmountCell(amountCell, workbook.sharedStrings, { excelTextQuirk });
      rows.push({ row, label: label.trim(), amountCents });
    } catch (error) {
      if (error instanceof AmountParseError) {
        unparsable.push({ ref: error.ref, raw: error.raw });
        rows.push({ row, label: label.trim(), amountCents: null });
      } else {
        throw error;
      }
    }
  }
  return rows;
}

/** `M23:M36`/`N23:N36`: every row where both `M` and `N` hold a plain number (docs/ledger-spec.md §6.5). */
function extractRentSeries(workbook: XlsxWorkbook): RentSeriesPair[] {
  const pairs: RentSeriesPair[] = [];
  for (let row = 1; row <= workbook.maxRow; row++) {
    const mCell = workbook.cells.get(`M${row}`);
    const nCell = workbook.cells.get(`N${row}`);
    if (!mCell || !nCell) continue;
    if (mCell.type !== undefined || mCell.formula !== undefined) continue; // text label rows elsewhere in M
    if (nCell.type !== undefined || nCell.formula !== undefined) continue;
    if (mCell.value === undefined || nCell.value === undefined) continue;
    const amountCents = parseAmountCell(mCell, workbook.sharedStrings);
    const months = Number(nCell.value);
    if (amountCents === null || !Number.isInteger(months) || months <= 0) continue;
    pairs.push([amountCents, months]);
  }
  return pairs;
}

/* -------------------------------------------------------------------------- */
/* Import records — the shape every transaction takes before it becomes a DB  */
/* row (or a --dry-run report line)                                          */
/* -------------------------------------------------------------------------- */

interface ImportRecord {
  externalKey: string;
  payer: "P1" | "P2";
  splitMode: "SPLIT_EQUAL" | "OTHER_ONLY" | "SETTLEMENT";
  amountCents: number;
  description: string;
  categorySlug: string;
  categorySource: "heuristic" | "system";
  bookedAtMs: number;
  dateSource: "day" | "month" | "estimated";
  importSeq: number | null;
  planPeriod: string | null;
  tags: string[];
}

interface ColumnReport {
  label: string;
  count: number;
  sumCents: number;
  skippedNoAmount: { row: number; label: string }[];
}

interface ImportResult {
  records: ImportRecord[];
  columnReports: ColumnReport[];
  rentSeries: { pairs: RentSeriesPair[]; bookings: number; sumCents: number };
  transferCents: number;
  balanceCents: number;
  precisionCounts: Record<"day" | "month" | "estimated", number>;
  categorized: number;
  uncategorized: number;
  unparsable: UnparsableCell[];
}

function buildImport(workbook: XlsxWorkbook, excelTextQuirk: boolean, importDate: CalendarDate): ImportResult {
  const records: ImportRecord[] = [];
  const columnReports: ColumnReport[] = [];
  const precisionCounts: Record<"day" | "month" | "estimated", number> = { day: 0, month: 0, estimated: 0 };
  const unparsable: UnparsableCell[] = [];
  let categorized = 0;
  let uncategorized = 0;

  for (const spec of COLUMNS) {
    const rawRows = extractColumn(workbook, spec.labelCol, spec.amountCol, excelTextQuirk, unparsable);
    const withAmount = rawRows.filter((r) => r.amountCents !== null);
    const skipped = rawRows.filter((r) => r.amountCents === null).map((r) => ({ row: r.row, label: r.label }));

    // Dates are resolved over EVERY labelled row, including the four
    // skipped_no_amount ones — row order is what makes the anchor/carry
    // heuristic safe, and docs/ledger-spec.md §6.3's own precision tripwire
    // (Σ 263, not 259) counts every label, not just the ones that end up as
    // transactions.
    const dates = resolveColumnDates(
      rawRows.map((r) => ({ row: r.row, label: r.label })),
      MOVE_IN,
      importDate,
    );
    // Same reasoning as the date precision counters above: the spec's own
    // category-coverage tripwire ("243/263 classified") is measured over
    // every real label, including the four that never become transactions.
    const categoryBySlug = new Map<number, string>();
    for (const r of rawRows) {
      const { slug, matched } = categorize(r.label);
      categoryBySlug.set(r.row, slug);
      if (matched) categorized++;
      else uncategorized++;
    }
    for (const r of rawRows) precisionCounts[dates.get(r.row)!.precision]++;

    let sumCents = 0;
    for (const r of withAmount) {
      const amountCents = r.amountCents!;
      sumCents += amountCents;
      const resolved = dates.get(r.row)!;
      const slug = categoryBySlug.get(r.row)!;

      records.push({
        externalKey: `${spec.externalKeyPrefix}:${r.row}`,
        payer: spec.payer,
        splitMode: spec.splitMode,
        amountCents,
        description: r.label,
        categorySlug: slug,
        categorySource: "heuristic",
        bookedAtMs: dateStartMsBerlin(resolved),
        dateSource: resolved.precision,
        importSeq: r.row,
        planPeriod: null,
        tags: ["import"],
      });
    }

    columnReports.push({ label: spec.label, count: withAmount.length, sumCents, skippedNoAmount: skipped });
  }

  // Rent series -> 50 monthly OTHER_ONLY bookings (docs/ledger-spec.md §6.5).
  const rentPairs = extractRentSeries(workbook);
  const rentBookings = expandRentSeries(rentPairs, RENT_SERIES_START);
  let rentSumCents = 0;
  for (const booking of rentBookings) {
    rentSumCents += booking.amountCents;
    records.push({
      externalKey: `xlsx:rent:${booking.period}`,
      payer: "P1",
      splitMode: "OTHER_ONLY",
      amountCents: booking.amountCents,
      description: `Fixkostenanteil ${planPeriodLabel(booking.period)}`,
      categorySlug: "fixkosten",
      categorySource: "system",
      bookedAtMs: periodStartMs(booking.period),
      dateSource: "month",
      importSeq: null,
      planPeriod: booking.period,
      tags: ["fixkosten", "import"],
    });
  }

  // K4 -> one SETTLEMENT (docs/ledger-spec.md §6.6).
  const k4Cell = workbook.cells.get("K4");
  const transferCents = parseAmountCell(k4Cell, workbook.sharedStrings) ?? 0;
  records.push({
    externalKey: "xlsx:transfers:total",
    payer: "P2",
    splitMode: "SETTLEMENT",
    amountCents: transferCents,
    description: "Übernahme Haushalt.xlsx: Summe aller Ausgleichszahlungen",
    categorySlug: "ausgleich",
    categorySource: "system",
    bookedAtMs: dateStartMsBerlin(MOVE_IN),
    dateSource: "day",
    importSeq: null,
    planPeriod: null,
    tags: ["import", "sammelbuchung"],
  });

  // Balance, computed the same way @toon/shared computes it everywhere else —
  // P1 is "person1Id" here in the abstract two-letter sense docs/ledger-spec.md
  // §2.3 uses, not a real user id yet (that only exists once --household is given).
  const balanceTxs: BalanceTransaction[] = records.map((r) => ({
    payerId: r.payer === "P1" ? "P1" : "P2",
    splitMode: r.splitMode,
    amountCents: r.amountCents,
  }));
  const balanceCents = computeBalance(balanceTxs, "P1");

  return {
    records,
    columnReports,
    rentSeries: { pairs: rentPairs, bookings: rentBookings.length, sumCents: rentSumCents },
    transferCents,
    balanceCents,
    precisionCounts,
    categorized,
    uncategorized,
    unparsable,
  };
}

function planPeriodLabel(period: string): string {
  const [year, month] = period.split("-");
  return `${month}/${year}`;
}

/* -------------------------------------------------------------------------- */
/* Reconciliation (docs/ledger-spec.md §6.7)                                  */
/* -------------------------------------------------------------------------- */

const TOLERANCE_CENTS = 25;

function printReport(workbook: XlsxWorkbook, defaultResult: ImportResult, quirkResult: ImportResult): { ok: boolean } {
  console.log("");
  console.log("Column summary");
  for (const col of defaultResult.columnReports) {
    console.log(
      `  ${col.label.padEnd(20)} ${String(col.count).padStart(3)} tx   ${formatCents(col.sumCents).padStart(14)}`,
    );
    if (col.skippedNoAmount.length > 0) {
      for (const s of col.skippedNoAmount) {
        console.log(`    skipped_no_amount: row ${s.row} "${s.label}"`);
      }
    }
  }
  console.log(`  M/N  Schafi Miete       ${String(defaultResult.rentSeries.bookings).padStart(3)} tx   ${formatCents(defaultResult.rentSeries.sumCents).padStart(14)}`);
  console.log(`  K4   überwiesen           1 tx   ${formatCents(defaultResult.transferCents).padStart(14)}`);

  const totalTx = defaultResult.records.length;
  console.log("");
  console.log(`Total transactions: ${totalTx}`);
  console.log(
    `Date precision: day=${defaultResult.precisionCounts.day} month=${defaultResult.precisionCounts.month} estimated=${defaultResult.precisionCounts.estimated}`,
  );
  console.log(`Category heuristic: ${defaultResult.categorized} classified, ${defaultResult.uncategorized} -> ${DEFAULT_CATEGORY_FALLBACK}`);

  let ok = true;
  if (defaultResult.unparsable.length > 0) {
    console.error("");
    console.error(`unparsable_amount: ${defaultResult.unparsable.length} cell(s) could not be parsed as an amount:`);
    for (const cell of defaultResult.unparsable) console.error(`  ${cell.ref}: ${JSON.stringify(cell.raw)}`);
    ok = false;
  }

  const k21Cell = workbook.cells.get("K21");
  const k21Value = k21Cell?.value !== undefined ? Number(k21Cell.value) : undefined;
  const k21Cents = k21Value !== undefined ? k21Value * 100 : undefined;

  console.log("");
  console.log("Reconciliation against Haushalt.xlsx");
  if (k21Cents !== undefined) {
    console.log(`  Sheet K21 (Excel semantics)                    ${formatCents(Math.round(k21Cents)).padStart(14)}   (${k21Cents.toFixed(1)} ct)`);
  }
  console.log(`  Importer, --excel-text-quirk (H79 excluded)    ${formatCents(quirkResult.balanceCents).padStart(14)}   (${quirkResult.balanceCents} ct)`);
  console.log(`  Importer, default (H79 = "28,93" recovered)    ${formatCents(defaultResult.balanceCents).padStart(14)}   (${defaultResult.balanceCents} ct)`);

  if (k21Cents !== undefined) {
    const quirkDeltaCents = quirkResult.balanceCents - k21Cents;
    console.log("");
    console.log(`  quirk-vs-sheet delta: ${quirkDeltaCents.toFixed(1)} ct (tolerance ±${TOLERANCE_CENTS} ct)`);
    if (Math.abs(quirkDeltaCents) > TOLERANCE_CENTS) {
      console.error(
        `  FAIL: rounding-only delta ${quirkDeltaCents.toFixed(1)} ct exceeds the ${TOLERANCE_CENTS} ct tolerance — likely a parsing bug.`,
      );
      ok = false;
    }
    const h79DeltaCents = defaultResult.balanceCents - quirkResult.balanceCents;
    console.log(
      `  H79 text-cell recovery (named, not a tolerance): ${formatCents(h79DeltaCents)} (${h79DeltaCents} ct) — real money, always included by default.`,
    );
  }

  console.log("");
  console.log(`Saldo (default) ${formatCents(defaultResult.balanceCents)}`);

  return { ok };
}

/* -------------------------------------------------------------------------- */
/* DB write (skipped entirely for --dry-run)                                 */
/* -------------------------------------------------------------------------- */

async function writeToHousehold(householdId: string, result: ImportResult): Promise<void> {
  // Imported lazily so --dry-run never touches the database module (and
  // therefore never requires DATABASE_URL / migrations to be present).
  const { db, client } = await import("../src/db/client.ts");
  const { transactions } = await import("../src/db/schema.ts");
  const { slot1UserId, requireOtherMemberId } = await import("../src/services/households/members.service.ts");
  const { categoryIdBySlug } = await import("../src/services/categories/categories.service.ts");
  const { syncTransactionTags } = await import("../src/services/tags/tags.service.ts");
  const { withTransaction } = await import("../src/services/support.ts");

  const p1Id = await slot1UserId(db, householdId);
  const p2Id = await requireOtherMemberId(db, householdId, p1Id);

  const categoryIds = new Map<string, string | null>();
  async function resolveCategoryId(slug: string): Promise<string | null> {
    if (!categoryIds.has(slug)) categoryIds.set(slug, await categoryIdBySlug(db, householdId, slug));
    return categoryIds.get(slug)!;
  }

  let inserted = 0;
  let alreadyPresent = 0;

  await withTransaction(db, async (tx) => {
    for (const record of result.records) {
      const existing = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.externalKey, record.externalKey))
        .limit(1);
      if (existing[0]) {
        alreadyPresent++;
        continue;
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      const categoryId = await resolveCategoryId(record.categorySlug);
      await tx.insert(transactions).values({
        id,
        householdId,
        payerId: record.payer === "P1" ? p1Id : p2Id,
        splitMode: record.splitMode,
        amountCents: record.amountCents,
        description: record.description,
        categoryId,
        bookedAt: record.bookedAtMs,
        dateSource: record.dateSource,
        origin: "import",
        planPeriod: record.planPeriod,
        categorySource: record.categorySource,
        importSeq: record.importSeq,
        externalKey: record.externalKey,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      });
      await syncTransactionTags(tx, householdId, id, record.tags);
      inserted++;
    }
  });

  console.log("");
  console.log(`[import-xlsx] wrote ${inserted} new transaction(s), ${alreadyPresent} already present (idempotent re-run).`);
  await client.close();
}

/* -------------------------------------------------------------------------- */
/* main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.filePath)) {
    console.error(`[import-xlsx] file not found: ${args.filePath}`);
    process.exit(1);
  }

  console.log(`[import-xlsx] reading ${args.filePath}`);
  const workbook = readWorkbook(args.filePath);
  console.log("[import-xlsx] sheets skipped (dead, not imported): Urlaub, Nahrung, Grundriss");

  const importDate = todayBerlin();
  const defaultResult = buildImport(workbook, false, importDate);
  const quirkResult = buildImport(workbook, true, importDate);

  const { ok } = printReport(workbook, defaultResult, quirkResult);

  if (args.dryRun) {
    console.log("");
    console.log(
      args.householdId
        ? "[import-xlsx] --dry-run: no database write performed."
        : "[import-xlsx] no --household given: no database write performed.",
    );
  } else if (ok) {
    await writeToHousehold(args.householdId!, defaultResult);
  } else {
    console.error("[import-xlsx] reconciliation failed — skipping database write. See FAIL line above.");
  }

  if (!ok) {
    console.error("[import-xlsx] reconciliation failed — see FAIL line above.");
    process.exit(1);
  }
  process.exit(0);
}

await main();
