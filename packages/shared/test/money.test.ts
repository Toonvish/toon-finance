import { describe, expect, test } from "bun:test";
import { CENTS_PER_EURO, divRoundHalfAwayFromZero, halfForOther, halfForPayer, parseGermanAmount } from "../src/money.ts";
import { SAMPLE_ROWS } from "./fixtures/haushalt-xlsx.ts";

describe("halfForOther / halfForPayer: table of small amounts", () => {
  test.each([
    [100, 50, 50],
    [101, 50, 51],
    [1, 0, 1],
    [0, 0, 0],
    [-100, -50, -50],
    [-101, -50, -51],
    [-1, 0, -1],
  ])("halfForOther(%i) === %i, halfForPayer(%i) === %i", (cents, other, payer) => {
    expect(halfForOther(cents)).toBe(other);
    expect(halfForPayer(cents)).toBe(payer);
  });
});

test("halfForOther: the payer bears the odd cent in BOTH sign directions", () => {
  // The Math.floor trap, called out explicitly in docs/ledger-spec.md §3.2:
  // Math.floor(-101 / 2) === -51, which would hand the NON-payer the larger
  // share of a credit while the payer keeps the larger share of a cost.
  expect(halfForOther(-101)).toBe(-50);
  expect(halfForPayer(-101)).toBe(-51);
  expect(Math.floor(-101 / 2)).toBe(-51); // documents the trap this must not fall into
});

describe("halfForOther: real rows from the sheet", () => {
  test("B51 = -76 273 -> -38 136", () => {
    expect(halfForOther(SAMPLE_ROWS.b51)).toBe(-38_136);
    expect(halfForPayer(SAMPLE_ROWS.b51)).toBe(-38_137);
  });

  test("B9 = 39 615 -> 19 807", () => {
    expect(halfForOther(SAMPLE_ROWS.b9)).toBe(19_807);
    expect(halfForPayer(SAMPLE_ROWS.b9)).toBe(19_808);
  });

  test("E4 = 18 995 -> 9 497", () => {
    expect(halfForOther(SAMPLE_ROWS.e4)).toBe(9_497);
    expect(halfForPayer(SAMPLE_ROWS.e4)).toBe(9_498);
  });
});

test("halfForOther + halfForPayer reconstruct the total", () => {
  for (let i = 0; i < 500; i += 1) {
    const cents = Math.round((Math.random() - 0.5) * 2_000_000);
    expect(halfForOther(cents) + halfForPayer(cents)).toBe(cents);
  }
});

test("halfForOther is odd-symmetric: halfForOther(-a) === -halfForOther(a)", () => {
  for (let i = 0; i < 500; i += 1) {
    const cents = Math.round(Math.random() * 1_000_000);
    expect(halfForOther(-cents)).toBe(-halfForOther(cents));
  }
});

describe("divRoundHalfAwayFromZero", () => {
  test("rounds away from zero on an exact .5", () => {
    expect(divRoundHalfAwayFromZero(5, 2)).toBe(3);
    expect(divRoundHalfAwayFromZero(-5, 2)).toBe(-3);
  });

  test("does not round when the quotient is already exact", () => {
    expect(divRoundHalfAwayFromZero(100, 4)).toBe(25);
    expect(divRoundHalfAwayFromZero(-100, 4)).toBe(-25);
  });

  test("matches the income-share worked example from docs/ledger-spec.md §4.2", () => {
    expect(divRoundHalfAwayFromZero(204_734 * 127_905, 538_560)).toBe(48_623);
    expect(divRoundHalfAwayFromZero(333_826 * 127_905, 538_560)).toBe(79_282);
  });
});

describe("parseGermanAmount", () => {
  test.each([
    ["1.234,56", 123_456],
    ["1234,56", 123_456],
    ["1234.56", 123_456],
    ["-12,5", -1_250],
  ])("parseGermanAmount(%j) === %i", (input, expected) => {
    expect(parseGermanAmount(input)).toBe(expected);
  });

  test("accepts a trailing euro sign and surrounding whitespace", () => {
    expect(parseGermanAmount("  12,50 €  ")).toBe(1_250);
  });

  test("a bare integer has no cents", () => {
    expect(parseGermanAmount("42")).toBe(4_200);
  });

  test("rejects garbage input", () => {
    expect(parseGermanAmount("abc")).toBeNull();
    expect(parseGermanAmount("")).toBeNull();
    expect(parseGermanAmount("12,345")).toBeNull();
    expect(parseGermanAmount("--12")).toBeNull();
  });
});

test("CENTS_PER_EURO is 100", () => {
  expect(CENTS_PER_EURO).toBe(100);
});
