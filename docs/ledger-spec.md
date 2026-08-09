# toon-finance ledger specification

**Authoritative.** This document defines the business logic: the transaction model, the cent
arithmetic, the fixed-cost plan with income-proportional monthly booking, the balance, and the
one-off `Haushalt.xlsx` import. Implementation agents build against this document; the pure
functions described here live in `packages/shared` and every rule with a number attached to it has
a matching entry in [§8 Test vectors](#8-test-vectors).

Prose is English (repo convention, same as `toon-recipe/docs/*`). German strings that appear in
this document are **data** — sheet labels, category names, i18n catalog values — not prose.

Every figure below was re-derived from `/home/erics/software/toon-finance/Haushalt.xlsx` by
unzipping the workbook and parsing `xl/worksheets/sheet1.xml` against `xl/sharedStrings.xml`.
Discrepancies with the briefing are called out explicitly in [§1.7](#17-deviations-from-the-briefing).

---

## 0. Vocabulary

| Term | Meaning |
| --- | --- |
| **Person 1 / P1** | The household member whose perspective the UI defaults to. In the imported data: Eric. |
| **Person 2 / P2** | The other member. In the imported data: Sandy ("Schafi"). |
| **Cents** | Signed integer minor units of EUR. The only money representation that exists in the database, in `@toon/shared`, and on the wire. |
| **Period** | A calendar month, `YYYY-MM`, e.g. `2026-08`. The unit of the fixed-cost plan. |
| **Balance** | Signed integer cents. **Positive = P2 owes P1.** |
| **Anchor** | An import-time row whose label yields a date with an explicit year. |

There are exactly two people. This is a product constraint, not an accident: no N-person split
engine, no per-transaction percentage rules, no shares table. Anything in this spec that looks like
it generalises to N people does so by coincidence and must not be treated as a requirement.

---

## 1. Inventory of `Haushalt.xlsx`

### 1.1 Workbook structure

The file is a standard OOXML package. Sheet-to-part mapping (from `xl/_rels/workbook.xml.rels`):

| Sheet name | Part | Status |
| --- | --- | --- |
| `Kostenrechnung` | `xl/worksheets/sheet1.xml` (`rId1`) | **The only sheet that matters.** |
| `Urlaub` | `sheet2.xml` (`rId2`) | Dead. Not imported, not rebuilt. |
| `Nahrung` | `sheet3.xml` (`rId3`) | Dead. |
| `Grundriss` | `sheet4.xml` (`rId4`) | Dead (floor plan, contains `xl/media/image1.png`). |

`xl/sharedStrings.xml` holds 299 unique strings. `openpyxl` is **not** installed and must not become
a dependency; the importer parses the ZIP + XML itself (Bun: `Bun.file().arrayBuffer()` +
a minimal inflate + `DOMParser`-free string scanning, or a vendored tiny unzip). The reference
extraction used for this document is Python `zipfile` + `xml.etree` and is reproducible in a
scratch directory.

### 1.2 The three ledger column pairs

| Cols | Header | Rows with data | Count | Sum (cents) | Sum (EUR) | Meaning |
| --- | --- | --- | --- | --- | --- | --- |
| A / B | `Ausgaben` | 3–117 | 111 amounts | `3 148 217` | 31 482.17 | P1 paid, split 50/50 |
| D / E | `Schafi gezahlt` | 3–29 | 27 amounts | `234 113` | 2 341.13 | P2 paid, split 50/50 |
| G / H | `Schafi Extra` | 3–123 | 121 amounts | `571 807` | 5 718.07 | P1 paid, 100 % attributable to P2 |

`A` spans 115 label rows but only 111 carry an amount (see §1.5). `G` spans 121 label rows and all
121 carry an amount — but one of them is text, see §1.4, which is why Excel's own `SUM(H3:H300)`
reports **5 689.14** (`568 914` cents), i.e. `571 807 − 2 893`.

### 1.3 Formula cells

Every formula in the sheet, with its cached value, re-derived and confirmed:

| Cell | Formula | Cached value | Verified |
| --- | --- | --- | --- |
| `K2` | `SUM(E3:E300)` | `2341.13` | ✓ `234 113` ct |
| `K3` | `K2/2` | `1170.5650000000001` | ✓ — **not rounded**, half a cent survives |
| `K4` | *(literal)* | `44588.91` | ✓ `4 458 891` ct — total of all P2→P1 settlements |
| `K5` | `K3+K4` | `45759.475…` | ✓ |
| `K13` | `SUM(B3:B1048576)` | `31482.170000000009` | ✓ `3 148 217` ct |
| `K14` | `ROUND(K13/2,2)` | `15741.09` | ✓ — `1 574 108.5` ct rounded half away from zero |
| `K15` | `SUM((H3:H300),N21)` | `30104.840000000004` | ✓ = `568 914 + 2 441 570` ct (**excludes H79**) |
| `K16` | `K13+K15` | `61587.010000000009` | ✓ |
| `K21` | `(K14+K15-K5)` | `86.455000000001746` | ✓ `8 645.5` ct |
| `N3` | `DATE(2021,9,1)` | serial `44440` | ✓ = 2021-09-01, move-in date |
| `N4` | `(YEAR(TODAY())-YEAR(N3))*12+(MONTH(TODAY())-MONTH(N3))` | `59` | ✓ for 2026-08 (volatile, `ca="1"`) |
| `N21` | `SUMPRODUCT(M23:M37,N23:N37)` | `24415.700000000004` | ✓ `2 441 570` ct |
| `P16` | `SUM(492.92,495.98*4,490.45*4,481.05*3,486.63*4,500.98*3)` | `9331.2500000000018` | ✓ `933 125` ct — informational only |
| `R5` | *(literal)* | `3338.26` | ✓ P1 gross monthly income |
| `R6` | *(literal)* | `2047.34` | ✓ P2 gross monthly income |
| `R7` | `R5+R6` | `5385.6` | ✓ `538 560` ct |
| `R8` | `1060+124+46.71+18.36+14.99+14.99` | `1279.05` | ✓ `127 905` ct — **six inlined fixed-cost items** |
| `R9` | `R8/R7` | `0.23749442959001779` | ✓ 23.749 442 959 % |
| `R10` | `R5*R9` | `792.81815452317289` | ✓ → 792.82 |
| `R11` | `R6*R9` | `486.231845476827` | ✓ → 486.23 |

Four **amount cells are themselves formulas** — the importer must read the cached `<v>`, not the
`<f>`, and these are the values:

| Cell | Formula | Value | Reading |
| --- | --- | --- | --- |
| `B40` | `=96` | `96.00` → `9 600` ct | `Internet`, entered as a formula for no reason |
| `B56` | `=-577.41 - H47` | `−108.97` → `−10 897` ct | `Rückzahlung 24`; `H47 = −468.44`, so `−577.41 − (−468.44) = −108.97` ✓ |
| `H48` | `=(67.36 + 29)` | `96.36` → `9 636` ct | `JGA` |
| `H51` | `=251.88 - 44.99` | `206.89` → `20 689` ct | `Zalando 06.2024` |

`B56` is a **cross-column reference into the `H` ledger**. It does not double-count (`H47` remains
its own `FOR_THEM` row of `−468.44`; `B56` merely nets a `−577.41` repayment against it), but it
means the sheet is not a flat list — the importer must not attempt to re-evaluate formulas, only to
read cached values. `xl/calcChain.xml` exists and is ignored.

### 1.4 The text cell — a live bug in the sheet

`H79` (`Amazon 09.04.25`) is stored as the **shared string `"28,93"`**, not as a number, because it
was typed with a German decimal comma. Excel's `SUM` silently skips text operands, so:

* the sheet believes `SUM(H3:H300) = 5 689.14`,
* the truth is `5 718.07`,
* **28.93 EUR of P2's debt has been invisible since April 2025.**

The importer parses text cells with `,` → `.` and therefore recovers this amount. Consequence: the
imported balance is **28.93 EUR higher** than the sheet's `K21`. This is not a rounding artefact and
must never be hidden inside a tolerance — see §6.7.

### 1.5 Label rows without an amount

Four rows in the `A` column carry a label but no value in `B`:

| Row | Label |
| --- | --- |
| `A6` | `4x Esstisch Stühle` |
| `A7` | `Sideboard` |
| `A10` | `Schlafsofa` |
| `A13` | `Gartenmöbel` |

All four are move-in furniture, all four sit in the first block of the sheet, and `Gartenmöbel`
reappears at `A38` as `Gartenmöbel + Topper` with `220.00`. They were almost certainly folded into
neighbouring lump sums.

**Decision: skip them.** A ledger entry without an amount is not a ledger entry; importing them as
`0.00` would pollute counts, category statistics and the transaction list with rows the user cannot
act on. The importer emits them under `skipped_no_amount` in its report (label + cell reference) so
the user can decide to add them by hand. There are no amount-without-label rows in any column.

### 1.6 Negative amounts

Negative amounts are load-bearing and their sign must survive the import unchanged. They are
refunds, returns, corrections and reverse transfers.

* `B` (P1 paid, split): **5 rows**, `−289.36` `Strom Rückerstattung`, `−762.73` `Rückzahlung`,
  `−108.97` `Rückzahlung 24`, `−77.69` `Strom Rückerstattung 2025`, `−300.00` `Gebrtstagsgeschenk`.
  Semantics: a credit on a shared expense — **both people share the credit**.
* `E` (P2 paid, split): **1 row**, `−300.00` `Burzeltag 24`.
* `H` (100 % P2): **19 rows**, e.g. `−468.44` `Rückzahlung`, `−521.00` `Autoversicherung`,
  `−372.70` `Analouge Pocket`, `−277.36` `Steuern 2025`, `−200.00` `Schafi Auto`.
  Semantics: a credit that belongs entirely to P2 — it reduces her debt by the full amount.

The UI must therefore accept negative amounts on all four transaction kinds (labelled
`Erstattung / Gutschrift` in the German catalog). The only forbidden amount is **zero**.

### 1.7 Deviations from the briefing

Everything in the briefing was confirmed except these three points:

1. **The rent series has 14 rows, not 15.** `M23:M37` is a 15-cell range but `M37`/`N37` are empty.
   The 14 pairs listed in the briefing are exactly the 14 that exist; the sum `24 415.70` and the
   month count (50) are correct.
2. **`SUM(H3:H300) = 5 689.14` is Excel's answer, not the arithmetic truth.** With `H79`'s
   `"28,93"` counted the column sums to `5 718.07`. The briefing's instruction "tolerate German
   decimal commas in text cells" and the briefing's target figure `86.455 EUR` are mutually
   exclusive; §6.7 resolves this by reporting both.
3. **The rent series start month is not stored anywhere.** `O16`'s label
   `Sandy Miete ab 01.06.2022` is the only anchor. Taking `2022-06` as the first period makes every
   other fact line up (see §6.5), so the importer uses `2022-06` as a **named constant**, not as a
   guess buried in code.

Minor observations, all confirmed as harmless: `N4` is volatile and re-evaluates on open;
`O16/P16` is a stale partial subtotal covering only the first 6 rent rows (19 months, `9 331.25`)
and must **not** be imported as a position; there is a 9-month gap (2021-09 … 2022-05) between
move-in and the first rent row, plausibly covered by the shared `A16 Miete 5 500.00` entry.

---

## 2. Domain model

### 2.1 Storage shape (symmetric, no hard-wired "me")

A transaction never stores "mine" or "theirs". It stores **who paid** and **how the cost is
attributed**:

```ts
export type SplitMode = 'SPLIT_EQUAL' | 'OTHER_ONLY' | 'SETTLEMENT';

export interface LedgerTransaction {
  id: string;                 // crypto.randomUUID()
  householdId: string;
  payerId: string;            // the person who moved the money
  splitMode: SplitMode;
  amountCents: number;        // signed integer, never 0
  description: string;
  categoryId: string | null;
  tags: string[];
  bookedAt: number;           // unix ms, integer
  createdAt: number;
  updatedAt: number;
  mutationId: string;         // client-minted, unique — offline replay guard
  externalKey: string | null; // unique — importer / fixed-plan idempotency
}
```

`OTHER_ONLY` means: *the person who is not the payer bears 100 % of this amount.* Since the
household has exactly two members, "the other person" is unambiguous and needs no
`beneficiaryId` column. Do not add one.

### 2.2 The four UI kinds

The UI offers exactly four choices. They are a **projection** of `(payerId, splitMode)` onto the
viewing user, computed at render time — never persisted:

| UI kind (de label) | `payerId` | `splitMode` | Who bears what |
| --- | --- | --- | --- |
| `MINE_SPLIT` — `Ich habe gezahlt, geteilt` | viewer | `SPLIT_EQUAL` | viewer bears half + odd cent, other bears half |
| `THEIRS_SPLIT` — `Partner:in hat gezahlt, geteilt` | other | `SPLIT_EQUAL` | other bears half + odd cent, viewer bears half |
| `FOR_THEM` — `Ich habe für Partner:in gezahlt` | viewer | `OTHER_ONLY` | other bears 100 % |
| `TRANSFER` — `Ausgleichszahlung erhalten` | other | `SETTLEMENT` | pure money movement, no expense |

Reading a transaction back from the *other* person's login flips the projection automatically:
a `MINE_SPLIT` created by P1 renders as `THEIRS_SPLIT` for P2, with no data migration and no
per-user rows. This is the whole reason for the symmetric storage shape.

`FOR_THEM` has no mirror in the UI list — "the other person paid something that is 100 % mine" is
representable in storage (`payerId = other`, `OTHER_ONLY`) and the balance maths handles it, but no
UI entry point creates it, because the sheet never needed one. If a fifth button is ever added it
is `THEIRS_FOR_ME` and it costs zero schema changes.

### 2.3 Balance contribution

Let `P1` be the person the balance is expressed for (positive = **P2 owes P1**). For one
transaction:

```
sign(tx)      = +1 if tx.payerId === P1 else −1
owedByOther(tx) = tx.splitMode === 'SPLIT_EQUAL'
                    ? halfForOther(tx.amountCents)      // §3.2
                    : tx.amountCents                    // OTHER_ONLY and SETTLEMENT alike
delta(tx)     = sign(tx) * owedByOther(tx)

balance = Σ delta(tx)
```

| `splitMode` | payer = P1 | payer = P2 |
| --- | --- | --- |
| `SPLIT_EQUAL` | `+ halfForOther(a)` | `− halfForOther(a)` |
| `OTHER_ONLY` | `+ a` | `− a` |
| `SETTLEMENT` | `+ a` | `− a` |

**`SETTLEMENT` and `OTHER_ONLY` are arithmetically identical.** They differ only in reporting:
`isExpense(tx) = tx.splitMode !== 'SETTLEMENT'`. Settlements are excluded from category totals,
from monthly spend charts and from "how much did we spend on Tiere" — they are debt movement, not
consumption. Encode that as one exported predicate in `@toon/shared`, not as an ad-hoc filter at
each call site.

Expanded to the briefing's form (P1's perspective, exact arithmetic ignoring rounding):

```
balance = Σ MINE_SPLIT/2 + Σ FOR_THEM − Σ THEIRS_SPLIT/2 − Σ TRANSFER
```

---

## 3. Cent arithmetic

### 3.1 Representation

* All money is `number` holding **signed integer cents**. Safe: the largest quantity in this domain
  is the lifetime total, `6 158 701` cents — eleven orders of magnitude below `Number.MAX_SAFE_INTEGER`.
* No `float` ever touches a monetary value. No `parseFloat` on user input; the German amount input
  parses `"1.234,56"` / `"1234,56"` / `"1234.56"` to `123456` with an integer-only routine.
* SQLite column type `integer`. Timestamps likewise `integer` unix ms, ISO strings on the wire.
* Formatting is display-only: `new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`
  applied to `cents / 100` at the very edge of the render tree.

### 3.2 The halving rule

**Rule: the payer bears the odd cent, in both sign directions.**

```ts
/** The non-payer's share of an equally split amount. */
export function halfForOther(cents: number): number {
  return (cents - (cents % 2)) / 2;   // JS % takes the sign of the dividend → truncation toward 0
}

/** The payer's own share. Always the complement — the two shares reconstruct the total exactly. */
export function halfForPayer(cents: number): number {
  return cents - halfForOther(cents);
}
```

| `cents` | `halfForOther` | `halfForPayer` | Sum |
| --- | --- | --- | --- |
| `100` | `50` | `50` | `100` |
| `101` | `50` | `51` | `101` |
| `1` | `0` | `1` | `1` |
| `0` | `0` | `0` | `0` |
| `−100` | `−50` | `−50` | `−100` |
| `−101` | `−50` | `−51` | `−101` |
| `−1` | `0` | `−1` | `−1` |

**Why truncation toward zero and not `Math.floor`.** `Math.floor(-101/2) === -51`, which would give
the *non-payer* the larger share of a credit while giving the *payer* the larger share of a cost —
the odd cent would switch sides with the sign. That asymmetry is invisible in tests built only from
positive amounts and then shows up as a drift in a ledger that contains 25 negative rows. The
truncating rule has one sentence of justification that holds everywhere: *whoever moved the money
absorbs the indivisible cent, whether it is a cost or a credit.* It also rounds costs in the
debtor's favour, which is the socially defensible direction for a two-person household.

The classic `floor` trap is called out explicitly here because it is the single most likely bug in
this codebase: **`halfForOther(-101)` must be `-50`, not `-51`.** There is a test vector for it.

Never write `Math.round(cents / 2)`, `~~(cents / 2)` or `cents >> 1`: the first is
sign-inconsistent, the second silently truncates above 2³¹, the third floors negatives.

### 3.3 Per-transaction halving vs. halving the total

The spreadsheet halves the **aggregate** (`K14 = ROUND(K13/2, 2)`); the app halves **every
transaction**. These are not the same number, and the difference is real money that must be
explained rather than tolerated:

| Column | Total (ct) | Odd-cent rows | Σ per-transaction halves | Half of the total | Delta |
| --- | --- | --- | --- | --- | --- |
| `B` (`SPLIT_EQUAL`, P1) | `3 148 217` | 39 (3 of them negative) | `1 574 092` | `1 574 109` (`ROUND` half away from zero) | **−17 ct** |
| `E` (`SPLIT_EQUAL`, P2) | `234 113` | 9 (all positive) | `117 052` | `117 056.5` exact / `117 057` rounded | **−5 ct** |

Per-transaction halving is the correct model: it is what the user sees on each row, it is
order-independent, and it survives editing or deleting a single transaction without re-deriving the
whole ledger. The aggregate figures in the sheet are an artefact of doing the arithmetic once at the
bottom of a column. The 22-cent combined delta is reported by the importer (§6.7), not swallowed.

### 3.4 Proportional rounding

For the fixed-cost plan a *share of a total* must be rounded. Definition, using integers only:

```ts
/** round(n / d) with half away from zero. d > 0 required. */
export function divRoundHalfAwayFromZero(n: number, d: number): number {
  const q = (2 * Math.abs(n) + d) / (2 * d);
  return Math.sign(n) * Math.floor(q);
}
```

`2 * Math.abs(n)` stays exact for every quantity in this domain (worst case here:
`2 × 204 734 × 127 905 ≈ 5.2 × 10¹⁰`).

**Residual rule: only the non-payer's share is ever rounded and booked.** The payer's share is
*defined* as `costTotal − otherShare`, so any ±1 cent residual lands on the payer by construction
and the two shares always reconstruct the total exactly. There is no second rounding to disagree
with the first. (`R10` in the sheet is display-only; the app computes it as the complement.)

---

## 4. Fixed-cost plan and income-proportional monthly booking

This is the reason the app exists. The sheet does it by hand: it computes P2's income-proportional
share of the monthly fixed costs (`R11`), and then writes that amount into the rent series
(`M36 = 486.23`, currently running for 11 months) as a 100 %-P2 position. The app automates exactly
that.

### 4.1 Entities

```ts
export interface FixedCostItem {
  id: string;
  householdId: string;
  label: string;            // "Miete", "Strom", "Internet", …
  amountCents: number;      // > 0
  activeFrom: string;       // period 'YYYY-MM', inclusive
  activeTo: string | null;  // period 'YYYY-MM', inclusive; null = open ended
}

export interface IncomeEntry {
  id: string;
  householdId: string;
  personId: string;
  amountCents: number;      // > 0, net monthly income
  validFrom: string;        // period 'YYYY-MM', inclusive
  validTo: string | null;
}

export interface FixedCostPlan {
  householdId: string;
  enabled: boolean;
  payerId: string;          // who fronts the fixed costs; default = person 1
  startPeriod: string;      // first period the plan may book, 'YYYY-MM'
  lastBookedPeriod: string | null;
}
```

Both `FixedCostItem` and `IncomeEntry` are **temporal, append-only in practice**: changing a salary
means closing the old row (`validTo`) and inserting a new one, never editing the amount in place.
That is what makes any period reproducible from data alone.

Seed values recovered from `R8` (the six inlined summands) and `R5`/`R6`:

| Fixed cost item | Cents | Note |
| --- | --- | --- |
| `Miete` | `106 000` | 1 060.00 |
| `Nebenkosten` | `12 400` | 124.00 — the sheet does not name it; label chosen |
| `Strom` | `4 671` | 46.71 |
| `Internet` | `1 836` | 18.36 |
| `Streaming 1` | `1 499` | 14.99 — two identical 14.99 items exist; names unknown |
| `Streaming 2` | `1 499` | 14.99 |
| **Total** | **`127 905`** | = `R8` ✓ |

| Income | Cents |
| --- | --- |
| P1 (`Eric`) | `333 826` |
| P2 (`Sandy`) | `204 734` |
| **Total** | **`538 560`** = `R7` ✓ |

The importer seeds these with `activeFrom` / `validFrom` = `2025-09` — the first period of the
current rent-series row `486.23 × 11`, i.e. the period from which these numbers demonstrably held.
It does **not** back-date them to move-in; earlier periods are represented by the imported history
(§6.5), not by a plan that would recompute them wrongly.

### 4.2 Derivation for one period

```ts
export interface PlanComputation {
  period: string;
  costTotalCents: number;
  incomeTotalCents: number;
  quoteNumerator: number;    // = costTotalCents
  quoteDenominator: number;  // = incomeTotalCents
  shares: { personId: string; incomeCents: number; shareCents: number }[];
  payerId: string;
  bookableCents: number;     // the non-payer's share — the amount that becomes a transaction
}
```

```
costTotal(p)   = Σ item.amountCents        for items active in p
incomeTotal(p) = Σ income.amountCents      for the income row effective in p, per person
quote(p)       = costTotal(p) / incomeTotal(p)                       // kept as a fraction, never a float
share(x, p)    = divRoundHalfAwayFromZero(income(x, p) * costTotal(p), incomeTotal(p))
payerShare(p)  = costTotal(p) − share(nonPayer, p)
bookable(p)    = share(nonPayer, p)
```

`quote` is exposed to the UI as a display percentage only (`23,75 %`), formatted from the exact
fraction with `Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 2 })`. It is
never used as an intermediate multiplicand — the share is computed in one integer expression so
there is exactly one rounding step.

**Verification against the sheet:**

```
costTotal    = 127 905
incomeTotal  = 538 560
quote        = 127 905 / 538 560 = 0.237494429590017825…      ✓ matches R9 to 15 digits

share(P2) = round(204 734 × 127 905 / 538 560)
          = round(26 186 502 270 / 538 560)
          = round(48 623.1845…)  = 48 623 ct = 486.23 €        ✓ matches R11 and M36

share(P1) = round(333 826 × 127 905 / 538 560)
          = round(42 698 014 530 / 538 560)
          = round(79 281.8154…)  = 79 282 ct = 792.82 €        ✓ matches R10

48 623 + 79 282 = 127 905 = costTotal                          ✓ exact, no residual cent
```

**Does the sum of the rounded shares hit the total?** For this data, yes — exactly, because the two
fractional parts are `0.1845…` and `0.8154…` and sum to `1.0000…`. That is not a coincidence
(the two shares are exact complements of a single division) but it *is* fragile: with three or more
income earners, or with a `quote` that produces two `.5` fractions, the rounded shares could sum to
`costTotal ± 1`. **This never matters here** because only `share(nonPayer)` is ever booked and
`payerShare` is defined as the complement (§3.4). The payer carries the residual, always, by
construction. The UI must render `payerShare` from the complement, not from a second rounding call
— otherwise the two displayed numbers can add up to `costTotal ± 1` and the user will notice.

### 4.3 The monthly booking

On the first day of each period, the plan writes one transaction:

| Field | Value |
| --- | --- |
| `payerId` | `plan.payerId` |
| `splitMode` | `OTHER_ONLY` |
| `amountCents` | `bookable(p)` |
| `description` | de: `Fixkostenanteil MM/YYYY`, en: `Fixed-cost share MM/YYYY` (rendered from the catalog at booking time in the household's default locale, then stored as plain text) |
| `bookedAt` | first day of `p`, 00:00 local Europe/Berlin, as unix ms |
| `categoryId` | `fixkosten` |
| `tags` | `['fixkosten', 'auto']` |
| `externalKey` | `` `fixedplan:${householdId}:${p}` `` |

`bookable(p)` may be `0` only if the fixed-cost list is empty or the plan is disabled; in that case
**no transaction is written** (the "amount ≠ 0" invariant holds for generated rows too).

### 4.4 Idempotency — the run starting twice

`transactions.external_key` carries a **unique index** (`unique(household_id, external_key)` with
`external_key` nullable — SQLite treats each NULL as distinct, so manual transactions are
unaffected). The booking is:

```sql
INSERT INTO transactions (...) VALUES (...) ON CONFLICT (household_id, external_key) DO NOTHING;
```

Two concurrent runs, a restart mid-loop, a retried HTTP call, a second container: all converge on
exactly one row per period. `plan.lastBookedPeriod` is a **cache for the catch-up scan, not the
source of truth** — the unique index is. If the two ever disagree, the index wins and
`lastBookedPeriod` is repaired from `MAX(period)` of the existing keys.

### 4.5 Catch-up — periods the container slept through

There is no cron dependency. The catch-up runs:

1. once at API boot, after migrations, before the server starts accepting traffic;
2. on a `setInterval` tick every 6 hours (cheap: one indexed query when there is nothing to do);
3. on demand via `POST /api/fixed-plan/run`.

```
from = max(plan.startPeriod, nextPeriod(plan.lastBookedPeriod ?? previousPeriod(plan.startPeriod)))
to   = currentPeriod()                    // Europe/Berlin
for p of periodsInclusive(from, to):
    compute(p) using the item/income rows valid *in p*, not today's rows
    insert … on conflict do nothing
```

Two rules make this safe:

* **The computation is always historical.** Period `2026-03` is computed from the salaries and items
  that were valid in March 2026, even if the catch-up runs in August. This is why the temporal
  `validFrom` / `activeFrom` columns exist.
* **The catch-up never books the future.** `to` is the current period, inclusive. A period is booked
  on or after its first day, never before.

A container that was off for five months therefore produces five correct rows on next boot, each
with the right amount and the right `bookedAt`, in one transaction.

### 4.6 Retroactive corrections — the history never changes silently

**A booked period is immutable.** Editing a salary that was valid three months ago does not touch
the three transactions already written. This is non-negotiable for a ledger: the balance the two
people agreed on last month must still be reconstructible.

Instead:

* `POST /api/fixed-plan/recalculate` with `{ dryRun: true }` returns a **preview**:
  `{ items: [{ period, bookedCents, recomputedCents, deltaCents }], totalDeltaCents }`, covering
  every already-booked period whose recomputed value differs.
* The UI shows that table (`Neuberechnung Fixkosten`) with the total delta and an explicit confirm.
* On confirm, the server writes **new adjustment transactions** — it does not rewrite the old ones:

  | Field | Value |
  | --- | --- |
  | `splitMode` | `OTHER_ONLY` |
  | `amountCents` | `recomputed − booked` (signed; may be negative) |
  | `description` | de: `Korrektur Fixkostenanteil MM/YYYY` |
  | `bookedAt` | now |
  | `externalKey` | `` `fixedplan-adj:${householdId}:${p}:${bookedCents}` `` |
  | `tags` | `['fixkosten', 'korrektur']` |

  The `externalKey` includes the superseded amount, so re-running the recalculation after a second
  salary correction produces a second, distinct adjustment rather than a conflict — while re-running
  it against unchanged data conflicts and does nothing.

Append-only adjustments beat in-place edits here for a concrete reason: the two people settle up
against a balance they both saw. If a retroactive edit could move a past month, the settlement they
made would silently stop matching the ledger. An adjustment row is visible, dated, and explains
itself.

### 4.7 Applying the plan to imported history

The 14 rent rows are *not* modelled as plan periods. They are imported as ordinary
`OTHER_ONLY` transactions with `externalKey = xlsx:rent:${period}` (§6.5). The live plan's
`startPeriod` is `2026-08` — the first period the sheet had not yet booked. The two never collide,
because their `externalKey` namespaces differ *and* their periods do not overlap.

The alternative — reconstructing 50 periods of salary/cost history so the plan could regenerate them
— is not possible: the sheet records only the *result* per period (the rent amount), never the
inputs. Importing the results and starting the plan at the seam is the only honest option, and it is
documented in the import report.

---

## 5. Balance and settlement

### 5.1 Sign convention

**Positive balance = Person 2 owes Person 1.** One convention, chosen once, stated in
`@toon/shared` as a doc comment on the return type. The UI never shows a raw sign: it renders

* `balance > 0` → de: `Sandy schuldet dir 115,26 €`
* `balance < 0` → de: `Du schuldest Sandy 42,10 €`
* `balance === 0` → de: `Ausgeglichen`

with the names substituted from the household members, and it renders the *viewer's* perspective by
negating when the viewer is P2. The catalog holds three keys, not three hard-coded sentences.

### 5.2 Aggregate form

```ts
export function computeBalance(txs: readonly LedgerTransaction[], person1Id: string): number
```

Pure, total, order-independent, integer-exact. Equivalent expanded form:

```
balance = Σ_{SPLIT, payer=P1} halfForOther(a)
        + Σ_{OTHER_ONLY, payer=P1} a
        + Σ_{SETTLEMENT, payer=P1} a
        − Σ_{SPLIT, payer=P2} halfForOther(a)
        − Σ_{OTHER_ONLY, payer=P2} a
        − Σ_{SETTLEMENT, payer=P2} a
```

The API exposes it as `GET /api/balance` → `{ balanceCents, asOf, breakdown: { splitOwnCents,
splitOtherCents, forOtherCents, settledCents } }` so the UI can show *why* the number is what it is
without re-deriving it client-side.

### 5.3 What a settlement does

A settlement is a transaction like any other: `splitMode: 'SETTLEMENT'`, `payerId` = the person
handing over the money, `amountCents` = what was handed over. It moves the balance toward zero by
exactly its amount and it is excluded from every expense statistic.

### 5.4 "Jetzt ausgleichen"

`POST /api/settlements` with `{ amountCents?, note? }`:

* Server reads the current balance `b`.
* `amountCents` defaults to `Math.abs(b)`; the payer is the debtor (`b > 0` → P2 pays).
* It writes one `SETTLEMENT` transaction. New balance = `b − sign(b) * amountCents`, which is `0`
  for the default.
* The request carries the balance the client displayed (`expectedBalanceCents`). If it no longer
  matches — the other person added a transaction thirty seconds ago — the server answers
  `409` `balance_stale` with the current value and the client re-prompts. Settling against a number
  you were not shown is the one race in this app that costs real money.

**Partial payments** need no special case: a settlement of less than `|b|` leaves the remainder
outstanding, a settlement of more flips the sign. Over-settlement is allowed (people round up to
€50) and produces a negative balance, which the UI states plainly rather than clamping.

Settlements are never auto-generated. The monthly fixed-cost booking creates *debt*, not payment.

---

## 6. The `Haushalt.xlsx` import

A one-off CLI script — `bun run scripts/import-haushalt.ts --file Haushalt.xlsx --household <id>
[--dry-run] [--excel-text-quirk]` — not a UI feature, not an endpoint. All of its output is English
(ops output, per the repo rule). It is idempotent via `externalKey` and safe to re-run.

### 6.1 Column mapping

| Source | `payerId` | `splitMode` | `externalKey` | Rows |
| --- | --- | --- | --- | --- |
| `A/B` `Ausgaben` | P1 | `SPLIT_EQUAL` | `xlsx:B:{row}` | 111 |
| `D/E` `Schafi gezahlt` | P2 | `SPLIT_EQUAL` | `xlsx:E:{row}` | 27 |
| `G/H` `Schafi Extra` | P1 | `OTHER_ONLY` | `xlsx:H:{row}` | 121 |
| `M/N` rent series | P1 | `OTHER_ONLY` | `xlsx:rent:{YYYY-MM}` | 50 (expanded) |
| `K4` transfer total | P2 | `SETTLEMENT` | `xlsx:transfers:total` | 1 |
| **Total** | | | | **310** |

`K13`, `K14`, `K15`, `K16`, `K21`, `K2`, `K3`, `K5`, `P16`, `N4`, `R5`–`R11` are **read for
verification and seeding only** and never become transactions.

### 6.2 Amount parsing

```
numeric cell (<c> without t, or t="n")  → Number(<v>)         → round(x * 100) half away from zero
formula cell (<f> present)              → cached <v>, same as above; never re-evaluate
shared string / inline string           → trim, replace '.' thousands? no — see below, ',' → '.', Number()
empty / missing                         → skip the row (§1.5), report it
```

Text amounts: the only real case is `"28,93"`. The parser accepts `-?\d+(?:[.,]\d{1,2})?` after
stripping spaces and a trailing `€`; a comma is a decimal separator. It **rejects** anything else
loudly (`unparsable_amount` in the report, non-zero exit) rather than guessing — a silently dropped
amount is exactly the bug the sheet already has.

`round(x * 100)` is safe for every value here because Excel's cached doubles are all within
`1e-9` of a 2-decimal value (`80.430000000000007` → `8043`). The parser asserts
`Math.abs(x * 100 - rounded) < 0.001` and fails the import otherwise.

### 6.3 Dates — parse from the label, else carry from the nearest anchor

Most rows have no date. Many labels embed one. The rows in each column are **append-only, so row
order is chronological at month granularity** — verified: every explicitly-dated row in every
column is in non-decreasing month order, with the only exceptions being three same-month day-level
inversions and one obvious typo (§6.4). That property is what makes inference safe.

**Pass 1 — anchors.** Apply, in order, to the trimmed label:

| # | Pattern | Example | Result |
| --- | --- | --- | --- |
| R1 | `(?<!\d)(\d{1,2})\.(\d{1,2})\.((?:19\|20)\d{2})(?!\d)` | `Stempelmühle 10.07.2026` | 2026-07-10, precision `day` |
| R2 | `(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{2})(?!\d)` | `Fressnapf 23.09.25`, `Amazon27.01.23` | 20YY, precision `day` |
| R3 | `(?<!\d)(\d{1,2})\.((?:19\|20)\d{2})(?!\d)`, month ≤ 12 | `Zalando 06.2024` | 2024-06, precision `month` |
| R4 | `(?<!\d)(\d{1,2})\.(\d{1,2})(?!\.?\d)` with **second number 13…99** | `Lebensmittel 11.22`, `Holy 07.24` | month.YY → 2022-11 / 2024-07, precision `month` |

R6 below is promoted into pass 1 whenever its label also carries an explicit, in-range 4-digit year
(`Prime day juni 2026` → anchor `2026-06-15`, precision `month`); without a usable year it stays in
pass 2. That is the only rule that appears in both passes.

R2 has no leading `\s` requirement on purpose: `Amazon27.01.23` (no space) is real data.
R4's discriminator is the only ambiguity resolver needed in the whole corpus: `d1.d2` is
`month.year` when `d2 > 12` (a day can't be), otherwise `day.month`.

A pass-1 match whose date falls outside `[2021-09-01, importDate]` is **rejected as an anchor** and
reported. There is exactly one: `Fressnapf 05.08.16` — a typo for `26`. Rejected anchors fall
through to pass 2, where the same day/month with an inferred year yields `2026-08-05`, which is
correct. The typo heals itself; no special case is needed.

**Pass 2 — inference between anchors.** For every non-anchor row, let `prev` be the nearest anchor
date above it (or the move-in date `2021-09-01` if none) and `next` the nearest anchor date below it
(or the import date if none).

| # | Pattern | Example | Result |
| --- | --- | --- | --- |
| R5 | `d1.d2` with `d2 ≤ 12` — day.month, year unknown | `Obi 02.10`, `Deutsche Bahn 5.9` | smallest year in `[prev.year, next.year]` for which the date lies in `[prev, next]`; precision `day` |
| R6 | German month name (`januar`…`dezember`, word-bounded, case-insensitive) + optional 4-digit year | `Tier Futter April`, `Prime day juni 20026` | month known, day := 15; year from the literal if present and in range, else inferred as in R5; precision `month` |
| R7 | nothing matched | `Sofa`, `Kalender 2025` | `bookedAt := prev`; precision `estimated` |

**Bare four-digit years are deliberately NOT a rule.** `Kalender 2025` (bought Nov 2024),
`Kalender 2026`, `Office 2021`, `Hotel 2024`, `Steuern 2025` are product names and tax years, not
purchase dates; three of the six would land in the wrong year. They fall to R7 and inherit the
nearest anchor, which is closer to the truth.

**The fallback is named**: `dateSource: 'carried'` — *the date of the nearest dated row above,
move-in date if there is none.* Every transaction stores `dateSource: 'day' | 'month' | 'estimated'`
plus `importSeq` (the original sheet row), and the transaction list sorts by
`bookedAt, importSeq` so the sheet's ordering survives inside a block of identical dates. The UI
marks `estimated` rows with a small `~` affordance and the catalog string `Datum geschätzt`.

Within an unanchored span the *inferred* dates are bounded by the surrounding anchors but not by
each other, so two neighbouring rows can invert by days (`Obi 02.10` → 2021-10-02 sits above
`Obi 30.09` → 2021-09-30). This is accepted: `importSeq` preserves the original order and no
business rule depends on intra-month sequence.

Resulting precision distribution over the 263 imported ledger rows:

| Column | rows | anchors | `day` | `month` | `estimated` |
| --- | --- | --- | --- | --- | --- |
| A/B | 115 | 16 | 28 | 7 | 80 |
| D/E | 27 | 3 | 6 | 0 | 21 |
| G/H | 121 | 20 | 22 | 7 | 92 |
| **Σ** | **263** | **39** | **56** | **14** | **193** |

Three informational warnings are expected and must not fail the import:
`Tierarzt 04.11.24` after `Futter 8.11.24`, `Kingsley 24.03.25` after `Amazon 25.03.25`,
`Steam 03.05.25` after `Zalando 05.05.25` — day-level inversions inside one month.

### 6.4 The 4 skipped rows

`A6`, `A7`, `A10`, `A13` — label, no amount. Skipped, reported (§1.5). Import does **not** fail.

### 6.5 The rent series → 50 monthly bookings

`M23:M36` / `N23:N36` are 14 `(amountCents, months)` pairs. They are expanded into **one
transaction per month**, contiguous, starting at `2022-06`:

| # | Amount | Months | Period span |
| --- | --- | --- | --- |
| 1 | 492.92 | 1 | 2022-06 |
| 2 | 495.98 | 4 | 2022-07 … 2022-10 |
| 3 | 490.45 | 4 | 2022-11 … 2023-02 |
| 4 | 481.05 | 3 | 2023-03 … 2023-05 |
| 5 | 486.63 | 4 | 2023-06 … 2023-09 |
| 6 | 500.98 | 3 | 2023-10 … 2023-12 |
| 7 | 482.83 | 5 | 2024-01 … 2024-05 |
| 8 | 488.54 | 5 | 2024-06 … 2024-10 |
| 9 | 493.07 | 2 | 2024-11 … 2024-12 |
| 10 | 489.01 | 1 | 2025-01 |
| 11 | 486.74 | 3 | 2025-02 … 2025-04 |
| 12 | 516.67 | 2 | 2025-05 … 2025-06 |
| 13 | 455.18 | 2 | 2025-07 … 2025-08 |
| 14 | 486.23 | 11 | 2025-09 … 2026-07 |
| | | **50** | **2022-06 … 2026-07** |

Three independent facts confirm the `2022-06` start:

* `O16`'s label `Sandy Miete ab 01.06.2022`, and `P16` sums exactly the first six rows = 19 months
  = 2022-06 … 2023-12;
* the series ends at `2026-07`, so the next unbooked period is `2026-08` — the current month, which
  the sheet's author had not yet written down on 2026-08-09;
* the last row's amount, `486.23`, equals `R11` — the *currently* valid income-proportional share,
  which has been running since `2025-09`.

Each booking: `payerId` = P1, `splitMode` = `OTHER_ONLY`, `bookedAt` = first of the period 00:00
Europe/Berlin, `description` = `Fixkostenanteil MM/YYYY` (same catalog string the live plan uses),
`categoryId` = `fixkosten`, `tags` = `['fixkosten', 'import']`, `externalKey` = `xlsx:rent:YYYY-MM`.

No rounding occurs: every rent amount is a whole number of cents multiplied by an integer month
count. The 50 rows sum to **`2 441 570` ct = 24 415.70 €**, byte-identical to `N21`.

The 9-month gap between move-in (2021-09) and `2022-06` is left empty and noted in the report.

### 6.6 `K4` → one settlement

`K4 = 44 588.91` is a hand-maintained running total of every transfer P2 ever made. The individual
transfers do not exist anywhere in the file. The importer therefore writes **one** transaction:

| Field | Value |
| --- | --- |
| `payerId` | P2 |
| `splitMode` | `SETTLEMENT` |
| `amountCents` | `4 458 891` |
| `description` | de: `Übernahme Haushalt.xlsx: Summe aller Ausgleichszahlungen` |
| `bookedAt` | 2021-09-01 (move-in) |
| `tags` | `['import', 'sammelbuchung']` |
| `externalKey` | `xlsx:transfers:total` |

Dating it at move-in rather than at import time is deliberate: it keeps the **current** balance
correct (which is all that is actually true about this number) and puts the unavoidable distortion
at the far left of any balance-over-time chart, where it reads as an opening balance, instead of
injecting a fake €44 k repayment into the most recent month. Charts must offer a
`Sammelbuchungen ausblenden` toggle that filters `tags contains 'sammelbuchung'`.

### 6.7 The check figure

At the end of a run the importer prints a reconciliation and **fails the process** if the
rounding-only delta leaves tolerance:

```
Reconciliation against Haushalt.xlsx
  Sheet K21 (Excel semantics)                    86.455 EUR   (8645.5 ct)
  Importer, --excel-text-quirk (H79 excluded)     86.33 EUR   (8633 ct)   delta -0.125 EUR
  Importer, default (H79 = "28,93" recovered)    115.26 EUR  (11526 ct)   delta +28.805 EUR

  Delta breakdown
    per-transaction halving of column B   -0.17 EUR   (39 odd-cent rows)
    per-transaction halving of column E   +0.045 EUR  (9 odd-cent rows, vs. unrounded K3)
    text cell H79 recovered by importer  +28.93 EUR   (Excel's SUM skips text operands)
```

* **Tolerance: `|delta| ≤ 25 ct` on the rounding-only comparison** (`--excel-text-quirk` mode). The
  observed value is `12.5 ct`; the bound is the sum of half a cent per odd-cent split row
  (`(39 + 9) / 2 = 24 ct`) plus the sheet's own half-cent in `K3`, rounded up. Exceeding it means a
  parsing bug, and the import aborts with a non-zero exit code.
* **The `28.93` line is never inside a tolerance.** It is a named, quantified line item. Silently
  absorbing it would reproduce the exact defect the import is supposed to fix.
* Default mode is the one that recovers `H79`. `--excel-text-quirk` exists only so the operator can
  reproduce the sheet's number and convince themselves the rest of the import is faithful.

Also asserted, each an independent tripwire:

```
Σ B                 = 3 148 217 ct        Σ per-tx halves B = 1 574 092 ct
Σ E                 =   234 113 ct        Σ per-tx halves E =   117 052 ct
Σ H (numeric only)  =   568 914 ct        Σ H (incl. H79)   =   571 807 ct
Σ rent expansion    = 2 441 570 ct        rent rows written = 50
K4                  = 4 458 891 ct        transactions written = 310
income total        =   538 560 ct        fixed cost total  =   127 905 ct
share(P2)           =    48 623 ct        share(P1)         =    79 282 ct
```

### 6.8 Idempotency and dry run

Every generated row carries a deterministic `externalKey`, so a second run inserts nothing
(`ON CONFLICT DO NOTHING`) and prints the same reconciliation. `--dry-run` runs the entire pipeline
including all assertions and prints the report without opening a write transaction.

---

## 7. Categories

### 7.1 Default set (German catalog)

Seeded per household at creation. `id` is stable and used in code and `externalKey`s; the label
comes from the i18n catalog (`de` source, `en` mirror), never from a literal in a component.

| `id` | de | en | Covers (examples from the sheet) |
| --- | --- | --- | --- |
| `tiere` | Tiere | Pets | Fressnapf, Futter, Katzen, Tierarzt, Kratzbaum, Velivery, Kokku |
| `miete` | Miete | Rent | Miete, Mietkaution |
| `nebenkosten` | Nebenkosten | Utilities | Strom, Stromnachzahlung, Rückerstattung, Internet |
| `fixkosten` | Fixkosten | Fixed costs | *generated* — the monthly plan booking and the imported rent series |
| `versicherung` | Versicherungen | Insurance | Haftpflicht, Autoversicherung |
| `steuern_abgaben` | Steuern & Abgaben | Taxes & fees | Steuern 2025 |
| `baumarkt` | Baumarkt & Renovierung | DIY & renovation | Obi, Farbe, Maler, Hammer, Fliegengitter, Tischbeine |
| `moebel_wohnen` | Möbel & Wohnen | Furniture & home | Ikea, Lutz, Menke, Osterman, Zurbrüggen, Sofa, Bett, Lampen |
| `elektronik` | Elektronik | Electronics | Tablet, SandyPC, Festplatte, Monitor, Headset, Kärcher, Vivoactive |
| `lebensmittel` | Lebensmittel | Groceries | Kaufland, Marktkauf, Lebensmittel, Supermark, Bautzener |
| `haushalt_kueche` | Haushalt & Küche | Household & kitchen | WMF, Mepal, Friteuse, Reiskocher, Mülleimer, Kerzen, Kalender |
| `drogerie` | Drogerie & Pflege | Drugstore & care | Parfum, Douglas, Rituals, Apotheke, Holy |
| `kleidung` | Kleidung & Accessoires | Clothing & accessories | Zalando, Schuhe, Adidas, Intersport, Birkenstock, Swarovski |
| `spiele_medien` | Spiele & Medien | Games & media | Steam, Sims 4, Hogwarts, Battlefield 6, Bücher, DVDs |
| `hobby_kreativ` | Hobby & Kreativ | Hobby & crafts | Wolle, Häkeln, Scheepjes, Faltkarten, Stempelmühle, Etsy |
| `mobilitaet` | Mobilität | Transport | Auto, Sprit, Tanken, Deutsche Bahn, Dienstreise |
| `reisen` | Reisen | Travel | Hotel 2024, Raddison Blu |
| `freizeit` | Freizeit & Ausgehen | Leisure & going out | Kygo, Ed Sheeran, Konzert, JGA, Hochzeit, Chinesisch Essen |
| `geschenke` | Geschenke & Spenden | Gifts & donations | Burzeltag, Weihnachtsgeschenke, Fleurop, Blumen, Spenden |
| `ausgleich` | Ausgleich & Rückzahlung | Settlement & refunds | Rückzahlung, Bargeld, Erstattung |
| `sonstiges` | Sonstiges | Other | fallback |

21 categories. `fixkosten` is system-owned (not deletable, not renameable by the user, because the
plan writes into it); the rest are ordinary rows the household may rename, hide or extend. Free-text
tags carry everything a category cannot (`fressnapf`, `amazon`, `urlaub-2024`) and are stored as a
JSON array with a `lower(trim())` normalisation and a per-household distinct-tag index for the
autocomplete.

### 7.2 Importer heuristic

First match wins; order matters (`Katzen Amazon` must hit `tiere` before anything else, and
`Sabine Karten` must hit `geschenke` before `hobby_kreativ`'s `karten`). All patterns are
case-insensitive; German umlauts are matched with an explicit alternation rather than a locale-aware
fold, so the rule table stays greppable.

| Order | Category | Pattern |
| --- | --- | --- |
| 1 | `tiere` | `fressnapf\|futter\|katze\|tierarzt\|tierazrt\|kratzbaum\|velivery\|kokku\|napf\|streu` |
| 2 | `miete` | `\bmiete\|mietkaution\|kaution` |
| 3 | `nebenkosten` | `strom\|nachzahlung\|r(ü\|ue)ckerstattung\|internet\|gas\|wasser\|abschlag` |
| 4 | `versicherung` | `haftpflicht\|versicherung` |
| 5 | `steuern_abgaben` | `steuern\|gez\|rundfunk` |
| 6 | `baumarkt` | `\bobi\b\|farbe\|maler\|hammer\|fliegengitter\|tischbeine\|kohle ?filter\|bauhaus\|hornbach\|schrauben` |
| 7 | `moebel_wohnen` | `schrank\|\bbett\b\|esstisch\|st(ü\|ue)hle\|sideboard\|sofa\|schreibtisch\|couch\|garderobe\|gartenm(ö\|oe)bel\|matratze\|lattenrost\|kommode\|\bikea\b\|\blutz\b\|menke\|osterman\|zurbr(ü\|ue)ggen\|badezimmerm\|gardinen\|lampe\|leuchte\|spiegel\|teppich\|regal\|topper\|rollen` |
| 8 | `elektronik` | `elektronik\|drucker\|tablet\|pc\b\|festplatte\|headset\|monitor\|moitor\|usb\|handy\|vivoactive\|analouge\|analogue\|pocket\|logitech\|kamera\|akku\|kabel\|k(ä\|ae)rcher\|f(ö\|oe)hn\|b(ü\|ue)geleisen\|staples\|office 20\|zubeh(ö\|oe)r` |
| 9 | `lebensmittel` | `lebensmittel\|kaufland\|marktkauf\|supermark\|edeka\|rewe\|aldi\|lidl\|essen\|sirup\|getr(ä\|ae)nk\|bautzener` |
| 10 | `haushalt_kueche` | `\bwmf\b\|mepal\|pfanne\|friteuse\|reiskocher\|thermoskanne\|kochblume\|m(ü\|ue)lleimer\|abfalleimer\|messer\|tischdecke\|kerzen\|weichsp(ü\|ue)ler\|toilette\|zahnb(ü\|ue)rste\|kalender\|lichterkette\|weihnachtsbaum\|\buhr\b\|schiff\|grill\|liity` |
| 11 | `drogerie` | `parfum\|pafum\|douglas\|rituals\|creme\|apotheke\|holy\b` |
| 12 | `kleidung` | `zalando\|schuhe\|hose\|pulli\|adidas\|intersport\|kingsley\|kingley\|birkenstock\|hoodie\|outlet\|jacke\|shopping\|schmuck\|swarovski` |
| 13 | `spiele_medien` | `hogwarts\|sims\|steam\|last of us\|staffel\|dvd\|houseflipper\|sun haven\|chef life\|roots of pacha\|only up\|the crew\|battlefield\|007\|simulator\|contract vile\|tiny bookshop\|b(ü\|ue)cher\|spiel\|nintendo\|playstation\|lenkrad` |
| 14 | `hobby_kreativ` | `wolle\|h(ä\|ae)ckel\|h(ä\|ae)kel\|scheepjes\|malen nach zahlen\|faltkarten\|kreativa\|creativa\|stempelm(ü\|ue)hle\|alpaka\|\betsy\b\|hula hoop\|bluebrixx\|karten\b\|buchst(ä\|ae)nder` |
| 15 | `mobilitaet` | `\bauto\b\|sprit\|tanken\|\bbahn\b\|dienstreise\|ticket` |
| 16 | `reisen` | `hotel\|raddison\|radisson\|urlaub\|reise\|flug` |
| 17 | `freizeit` | `kygo\|ed sheeran\|konzert\|\bbar\b\|\bjga\b\|hochzeit\|kino\|restaurant\|chinesisch` |
| 18 | `geschenke` | `geschenk\|geburtstag\|gebrtstag\|burzeltag\|weihnachten\|weihnachts\|fleurop\|blumen\|(ü\|ue)mit\|sabine\|sabien\|muddi\|mutti\|amelie\|spende` |
| 19 | `ausgleich` | `r(ü\|ue)ckzahlung\|bargeld\|(ü\|ue)berweisung\|erstattung` |
| 20 | `sonstiges` | *(fallback)* |

**Measured coverage over all 263 real labels: 243 classified (92.4 %), 20 fall to `sonstiges`
(7.6 %).** Of those 20, sixteen are marketplace or shopping-event names that genuinely carry no
category signal (`Amazon` ×8, `Amazon Prime Days`, `Prime Day` ×3, `Blackfriday 2025` ×2,
`Aliexpress 27.07.25`) and four are opaque (`Unterlage`, `Sunchi`, `Jean Lean 27.09.25`,
`All das ungesgate`). Marketplace names are deliberately **not** mapped anywhere: guessing
`elektronik` for every Amazon order would be worse than `Sonstiges`.

Two known benign misfires, accepted: `Blumen Häckeln` matches `geschenke` before `hobby_kreativ`
(`blumen` precedes), and `HandyHülle Sabine` matches `geschenke` rather than `elektronik`. The
importer writes `categorySource: 'heuristic'` on every auto-categorised row so a future
"recategorise" screen can find them.

Result distribution over the 263 rows:

```
tiere 38 · moebel_wohnen 32 · elektronik 22 · hobby_kreativ 21 · haushalt_kueche 20
sonstiges 20 · spiele_medien 20 · kleidung 16 · geschenke 13 · drogerie 12 · mobilitaet 10
baumarkt 8 · lebensmittel 8 · nebenkosten 6 · freizeit 6 · ausgleich 4 · miete 2
reisen 2 · versicherung 2 · steuern_abgaben 1
```

---

## 8. Test vectors

Every vector below is a unit test in `packages/shared`. The sheet-derived totals live in a single
fixture module (`packages/shared/test/fixtures/haushalt-xlsx.ts`) so the numbers appear once.

### 8.1 `halfForOther` / `halfForPayer` (§3.2)

| # | Input | `halfForOther` | `halfForPayer` |
| --- | --- | --- | --- |
| 1 | `100` | `50` | `50` |
| 2 | `101` | `50` | `51` |
| 3 | `1` | `0` | `1` |
| 4 | `0` | `0` | `0` |
| 5 | `−100` | `−50` | `−50` |
| 6 | **`−101`** | **`−50`** | **`−51`** ← the `Math.floor` trap; must not be `−51 / −50` |
| 7 | `−1` | `0` | `−1` |
| 8 | `B51 = −76 273` | `−38 136` | `−38 137` |
| 9 | `B9 = 39 615` | `19 807` | `19 808` |
| 10 | `E4 = 18 995` | `9 497` | `9 498` |
| 11 | property: `∀a. halfForOther(a) + halfForPayer(a) === a` | | |
| 12 | property: `∀a. halfForOther(−a) === −halfForOther(a)` | | |

### 8.2 Balance per transaction kind (§2.3)

P1 = `p1`, P2 = `p2`, balance expressed for P1.

| # | Transaction | Expected delta |
| --- | --- | --- |
| 13 | `{ payer: p1, SPLIT_EQUAL, 10 001 }` | `+5 000` |
| 14 | `{ payer: p2, SPLIT_EQUAL, 10 001 }` | `−5 000` |
| 15 | `{ payer: p1, OTHER_ONLY, 10 001 }` | `+10 001` |
| 16 | `{ payer: p2, OTHER_ONLY, 10 001 }` | `−10 001` |
| 17 | `{ payer: p2, SETTLEMENT, 10 001 }` | `−10 001` |
| 18 | `{ payer: p1, SPLIT_EQUAL, −30 000 }` | `−15 000` |
| 19 | `{ payer: p1, OTHER_ONLY, −46 844 }` (`H47 Rückzahlung`) | `−46 844` |
| 20 | empty ledger | `0` |
| 21 | property: `computeBalance(txs, p1) === −computeBalance(txs, p2)` | |
| 22 | property: shuffling `txs` does not change the result | |

### 8.3 Column aggregates from the sheet (§1.2, §3.3)

| # | Assertion | Expected |
| --- | --- | --- |
| 23 | `Σ B` | `3 148 217` ct |
| 24 | `Σ per-transaction halves of B` | `1 574 092` ct |
| 25 | `Σ E` | `234 113` ct |
| 26 | `Σ per-transaction halves of E` | `117 052` ct |
| 27 | `Σ H` including the `"28,93"` text cell | `571 807` ct |
| 28 | `Σ H` excluding it (Excel semantics) | `568 914` ct |
| 29 | rent series expansion: row count / sum | `50` rows / `2 441 570` ct |
| 30 | rent series first & last period | `2022-06` / `2026-07` |
| 31 | `K4` settlement | `4 458 891` ct |
| 32 | total transactions written by the importer | `310` |

### 8.4 End-to-end balance (§6.7)

| # | Mode | Expected balance |
| --- | --- | --- |
| 33 | importer default (H79 recovered) | `11 526` ct = **115.26 €** |
| 34 | `--excel-text-quirk` (H79 excluded) | `8 633` ct = **86.33 €** |
| 35 | sheet `K21`, for reference only | `8 645.5` ct = 86.455 € |
| 36 | delta 34 vs. 35 | `−12.5` ct, inside the 25 ct tolerance |
| 37 | delta 33 vs. 34 | exactly `+2 893` ct |

### 8.5 Income-proportional share (§4.2)

| # | Input | Expected |
| --- | --- | --- |
| 38 | `costTotal` from the six seed items | `127 905` ct |
| 39 | `incomeTotal` = `333 826 + 204 734` | `538 560` ct |
| 40 | `quote` formatted de-DE, 2 decimals | `"23,75 %"` |
| 41 | `share(P2)` = `round(204 734 × 127 905 / 538 560)` | `48 623` ct (exact quotient `48 623.1845…`) |
| 42 | `share(P1)` = `round(333 826 × 127 905 / 538 560)` | `79 282` ct (exact quotient `79 281.8154…`) |
| 43 | `share(P1) + share(P2)` | `127 905` ct — hits `costTotal` exactly, **no cent lost** |
| 44 | `payerShare` computed as complement | `127 905 − 48 623 = 79 282` ct — identical to 42 |
| 45 | residual rule: `costTotal = 100 001`, incomes `50 000 / 50 000` → `share(other)` | `50 001` (half away from zero), `payerShare = 50 000` — the payer absorbs the residual |
| 46 | `divRoundHalfAwayFromZero(5, 2)` / `(−5, 2)` | `3` / `−3` |
| 47 | plan disabled or `costTotal === 0` | no transaction written |

### 8.6 Monthly booking, idempotency, catch-up (§4.3–4.6)

| # | Scenario | Expected |
| --- | --- | --- |
| 48 | book `2026-08` twice | one row, `externalKey = fixedplan:{hh}:2026-08` |
| 49 | catch-up from `lastBookedPeriod = 2026-03`, now `2026-08` | 5 rows: `2026-04 … 2026-08` |
| 50 | catch-up never books ahead: now `2026-08`, plan through `2026-12` | last row `2026-08` |
| 51 | salary valid `2025-09`, corrected row valid `2026-05`; book `2026-02` | uses the `2025-09` salary |
| 52 | retroactive salary change for an already-booked period | zero existing rows mutated; preview lists `{ period, bookedCents, recomputedCents, deltaCents }` |
| 53 | confirm the recalculation | new `OTHER_ONLY` row with the signed delta, `externalKey = fixedplan-adj:{hh}:{period}:{bookedCents}` |
| 54 | confirm the same recalculation twice | second attempt conflicts, writes nothing |
| 55 | imported rent `2026-07` + live plan `startPeriod 2026-08` | no `externalKey` collision, no duplicate period |

### 8.7 Settlement (§5.4)

| # | Scenario | Expected |
| --- | --- | --- |
| 56 | balance `11 526`, settle in full | one `SETTLEMENT` by P2 of `11 526`; new balance `0` |
| 57 | balance `11 526`, settle `5 000` | new balance `6 526` |
| 58 | balance `11 526`, settle `15 000` | new balance `−3 474`; allowed, UI says P1 owes P2 |
| 59 | balance `−4 210`, settle in full | payer is P1; new balance `0` |
| 60 | `expectedBalanceCents` stale | `409 balance_stale`, nothing written |
| 61 | settlements excluded from category totals | spend per category unchanged by 56 |

### 8.8 Date resolution (§6.3)

| # | Label (column, row) | Expected date | `dateSource` |
| --- | --- | --- | --- |
| 62 | `Stempelmühle 10.07.2026` (G121) | 2026-07-10 | `day` (R1) |
| 63 | `Fressnapf 23.09.25` (A91) | 2025-09-23 | `day` (R2) |
| 64 | `Amazon27.01.23` (A47) | 2023-01-27 | `day` (R2, no space) |
| 65 | `Zalando 06.2024` (G51) | 2024-06-15 | `month` (R3) |
| 66 | `Lebensmittel 11.22` (G18) | 2022-11-15 | `month` (R4, second number > 12) |
| 67 | `Holy 07.24` (G55) | 2024-07-15 | `month` (R4) |
| 68 | `Obi 02.10` (A18) | 2021-10-02 | `day` (R5, year inferred, no anchor above → move-in) |
| 69 | `Deutsche Bahn 5.9` (G83) | 2025-05-05 | `estimated` — R5 matches (5 Sept) but no year places it inside the bracket `[2025-05-05, 2025-07-27]`, so it falls back to carry |
| 70 | `Ikea 10.09` (A66) | 2024-09-10 | `day` (R5) — must **not** be 2025 |
| 71 | `Tier Futter April` (A88) | 2025-04-15 | `month` (R6) |
| 72 | `Prime day juni 20026` (G120) | 2026-06-15 | `month` (R6, 5-digit year ignored) |
| 73 | `Fressnapf 05.08.16` (A116) | 2026-08-05 | anchor rejected (out of range), then R5-inferred |
| 74 | `Kalender 2025` (A74) | 2024-08-31 (carried from `Fressnapf 31.08.24`) | `estimated` — bare year is not a date rule, and 2024-08 is nearer the truth than 2025 |
| 75 | `Sofa` (A8) | 2021-09-01 | `estimated`, no anchor above → move-in |
| 75a | `Lebensmittel 11.22` is an **anchor** (R4 carries a year), `Obi 02.10` is not (R5) | anchor set = 39 rows | |
| 76 | precision counts over all 263 rows | `56 day / 14 month / 193 estimated` | |
| 77 | anchor count per column | A 16, D 3, G 20 | |

### 8.9 Amount parsing (§6.2)

| # | Cell | Raw | Expected cents |
| --- | --- | --- | --- |
| 78 | `H79` | shared string `"28,93"` | `2 893` |
| 79 | `B3` | `"1693"` | `169 300` |
| 80 | `B66` | `"80.430000000000007"` | `8 043` |
| 81 | `B56` | formula `=-577.41 - H47`, cached `"-108.96999999999997"` | `−10 897` |
| 82 | `H48` | formula `=(67.36 + 29)`, cached `"96.36"` | `9 636` |
| 83 | `H51` | formula `=251.88 - 44.99`, cached `"206.89"` | `20 689` |
| 84 | `B40` | formula `=96`, cached `"96"` | `9 600` |
| 85 | `"abc"` | text | throws `unparsable_amount`, import aborts |
| 86 | `B6` | missing | skipped, listed under `skipped_no_amount` |
| 87 | German input parser: `"1.234,56"` / `"1234,56"` / `"1234.56"` / `"-12,5"` | | `123 456` / `123 456` / `123 456` / `−1 250` |

### 8.10 Category heuristic (§7.2)

| # | Label | Expected `categoryId` |
| --- | --- | --- |
| 88 | `Fressnapf 23.09.25` | `tiere` |
| 89 | `Katzen Amazon 29.07` | `tiere` — order matters, not `sonstiges` |
| 90 | `Tierarzt Blutabnahme` | `tiere` |
| 91 | `Amazon Spiegel` | `moebel_wohnen` |
| 92 | `Amazon` | `sonstiges` — marketplace names are never guessed |
| 93 | `Sabine Karten` | `geschenke` — before `hobby_kreativ`'s `karten` |
| 94 | `Faltkarten 1.12` | `hobby_kreativ` |
| 95 | `SandyPC` | `elektronik` |
| 96 | `Autoversicherung` | `versicherung` — before `mobilitaet`'s `\bauto\b` |
| 97 | `Strom Rückerstattung 2025` | `nebenkosten` |
| 98 | `Rückzahlung` | `ausgleich` |
| 99 | full corpus | 243 / 263 classified, 20 `sonstiges` |

---

## 9. Open decisions deliberately made here

Recorded so they are not re-litigated silently:

1. **`synchronous = NORMAL`, inherited from `toon-recipe`, is NOT adopted unchanged.** That repo
   justified it as right "for a recipe box, not a cash book" — and this *is* the cash book.
   `db/client.ts` sets `PRAGMA journal_mode = WAL` **per connection** (same as the reference) but
   `PRAGMA synchronous = FULL`. The write volume here is a few transactions a day, not a bulk
   import, so the ~15 ms fsync cost is invisible to the user, and losing the last committed
   settlement to a power cut is not an acceptable failure mode for a ledger the two people settle
   money against. `busy_timeout = 5000` and `foreign_keys = ON` as in the reference.
2. **Amount-less sheet rows are skipped, not zero-imported** (§1.5).
3. **The odd cent goes to the payer, in both sign directions** (§3.2).
4. **Per-transaction halving, not aggregate halving** (§3.3) — the 22 ct divergence from the sheet
   is reported, not tuned away.
5. **`H79`'s 28.93 € is recovered by default** (§1.4, §6.7) — the sheet's `K21` is treated as a
   reference figure, not as ground truth.
6. **Booked periods are immutable; corrections are append-only adjustment rows** (§4.6).
7. **`K4` becomes one aggregate settlement dated at move-in** (§6.6).
8. **Bare four-digit years in labels are not date evidence** (§6.3).
9. **The rent series starts at `2022-06`** and is a named constant, not an inferred value (§6.5).
